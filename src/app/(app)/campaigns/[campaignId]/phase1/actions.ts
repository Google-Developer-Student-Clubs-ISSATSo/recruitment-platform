"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/permissions";
import { logActivity } from "@/lib/activity-log";
import {
  ApplicantStatus,
  PermissionKey,
  PhaseOneClassification,
} from "@/generated/prisma/enums";

// Save (update, add, or clear) the applicant's shared Phase 1 note — the
// ScreeningNote card under the scoring panel. Deliberately one shared text
// rather than per-scorer, like InterviewNote: the note is the screeners'
// running annotation of an applicant for the later stages. Nothing here
// touches scores or the weighted total; the two features are independent.
//
// Gated to SCREEN_PHASE1: the technical-only viewer's restricted payload never
// receives the note either — so both the read AND the write follow the same
// permission line.

export type SavePhaseOneNoteResult =
  | { ok: true }
  | { ok: false; error: string };

export async function savePhaseOneNote(
  campaignId: string,
  applicantId: string,
  text: string,
): Promise<SavePhaseOneNoteResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You are signed out." };

  if (!(await hasPermission(userId, PermissionKey.SCREEN_PHASE1))) {
    return {
      ok: false,
      error: "You don't have permission to write screening notes.",
    };
  }

  // Applicant must belong to this campaign and still be in the scoring pool —
  // the same gate the note's UI sits behind (the queue only lists SUBMITTED).
  const applicant = await prisma.applicant.findUnique({
    where: { id: applicantId },
    select: { campaignId: true, status: true },
  });
  if (!applicant || applicant.campaignId !== campaignId) {
    return { ok: false, error: "That applicant isn't in this campaign." };
  }
  if (applicant.status !== ApplicantStatus.SUBMITTED) {
    return { ok: false, error: "This applicant is no longer being scored." };
  }

  const note = text.trim();
  // Match the client's textarea maxLength — a sparse cap to stop a runaway
  // paste, generous enough for any real annotation.
  if (note.length > 2000) {
    return { ok: false, error: "Notes are limited to 2000 characters." };
  }

  // A trimmed-out note CLEARS it — deleting the row rather than storing "",
  // so the row's absence stays the single source of "no note yet".
  if (!note) {
    const removed = await prisma.phaseOneNote.deleteMany({
      where: { applicantId },
    });
    if (removed.count > 0) {
      await logActivity({
        actorId: userId,
        actionType: "PHASE1_APPLICANT_NOTE_CLEARED",
        targetType: "Applicant",
        targetId: applicantId,
        campaignId,
        details: {},
      });
    }
    revalidatePath(`/campaigns/${campaignId}/phase1`);
    return { ok: true };
  }

  const existing = await prisma.phaseOneNote.findUnique({
    where: { applicantId },
    select: { id: true },
  });
  await prisma.phaseOneNote.upsert({
    where: { applicantId },
    create: { applicantId, text: note, authorId: userId },
    update: { text: note, authorId: userId },
  });

  await logActivity({
    actorId: userId,
    actionType: existing
      ? "PHASE1_APPLICANT_NOTE_UPDATED"
      : "PHASE1_APPLICANT_NOTE_ADDED",
    targetType: "Applicant",
    targetId: applicantId,
    campaignId,
    details: { length: note.length },
  });

  revalidatePath(`/campaigns/${campaignId}/phase1`);
  return { ok: true };
}

// Enter (or re-enter) a single Phase 1 score. Saves immediately on selection —
// there is no per-question submit button. Enforcement mirrors the UI exactly:
//   - the Technical Skills question (requiresTechnicalScorer) needs
//     ENTER_TECHNICAL_SCORE;
//   - every other active question needs SCREEN_PHASE1.
// The check is server-side, so a user who only holds one permission can never
// write the other's scores even by calling this directly. The whole thing is
// campaign-scoped: applicant, question, and result all belong to campaignId.

export type SaveScoreResult =
  | { ok: true; weightedTotal: number; scoredCount: number }
  | { ok: false; error: string };

const EPS = 1e-9;

export async function savePhaseOneScore(
  campaignId: string,
  applicantId: string,
  questionId: string,
  value: number,
): Promise<SaveScoreResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You are signed out." };

  // Question must belong to this campaign and be active.
  const question = await prisma.phaseOneQuestion.findUnique({
    where: { id: questionId },
    select: {
      campaignId: true,
      isActive: true,
      requiresTechnicalScorer: true,
      noteScale: true,
    },
  });
  if (!question || question.campaignId !== campaignId || !question.isActive) {
    return { ok: false, error: "That question isn't part of this campaign." };
  }

  // Per-question permission — the one place technical vs. screening diverges.
  const needed = question.requiresTechnicalScorer
    ? PermissionKey.ENTER_TECHNICAL_SCORE
    : PermissionKey.SCREEN_PHASE1;
  if (!(await hasPermission(userId, needed))) {
    return {
      ok: false,
      error: question.requiresTechnicalScorer
        ? "Only the Technical Team can score this question."
        : "You don't have permission to score this question.",
    };
  }

  // Value must be one of the question's own allowed note-scale steps.
  if (!question.noteScale.some((v) => Math.abs(v - value) < EPS)) {
    return { ok: false, error: "That value isn't on this question's scale." };
  }

  // Applicant must belong to this campaign and still be scoreable (SUBMITTED —
  // auto-rejected applicants are never in the queue).
  const applicant = await prisma.applicant.findUnique({
    where: { id: applicantId },
    select: { campaignId: true, status: true },
  });
  if (!applicant || applicant.campaignId !== campaignId) {
    return { ok: false, error: "That applicant isn't in this campaign." };
  }
  if (applicant.status !== ApplicantStatus.SUBMITTED) {
    return { ok: false, error: "This applicant is no longer being scored." };
  }

  // Upsert the score on the (applicantId, questionId) unique key.
  await prisma.phaseOneScore.upsert({
    where: { applicantId_questionId: { applicantId, questionId } },
    create: { applicantId, questionId, value, scoredById: userId },
    update: { value, scoredById: userId, scoredAt: new Date() },
  });

  // Recompute the weighted total from ACTIVE questions that currently have a
  // score: Σ(value × coefficient). Partial while scoring is incomplete.
  const activeQuestions = await prisma.phaseOneQuestion.findMany({
    where: { campaignId, isActive: true },
    select: { id: true, coefficient: true },
  });
  const scores = await prisma.phaseOneScore.findMany({
    where: {
      applicantId,
      questionId: { in: activeQuestions.map((q) => q.id) },
    },
    select: { questionId: true, value: true },
  });
  const coeffById = new Map(activeQuestions.map((q) => [q.id, q.coefficient]));
  const weightedTotal = scores.reduce(
    (sum, s) => sum + s.value * (coeffById.get(s.questionId) ?? 0),
    0,
  );

  // Persist the running total. Classification stays PENDING — the ranking /
  // auto-classify pass is a later stage; this stage only does data entry.
  await prisma.phaseOneResult.upsert({
    where: { applicantId },
    create: {
      applicantId,
      weightedTotal,
      classification: PhaseOneClassification.PENDING,
    },
    update: { weightedTotal },
  });

  await logActivity({
    actorId: userId,
    actionType: question.requiresTechnicalScorer
      ? "PHASE1_TECHNICAL_SCORE_ENTERED"
      : "PHASE1_SCORE_ENTERED",
    targetType: "Applicant",
    targetId: applicantId,
    campaignId,
    details: { questionId, value },
  });

  revalidatePath(`/campaigns/${campaignId}/phase1`);
  return {
    ok: true,
    weightedTotal: Math.round(weightedTotal * 100) / 100,
    scoredCount: scores.length,
  };
}
