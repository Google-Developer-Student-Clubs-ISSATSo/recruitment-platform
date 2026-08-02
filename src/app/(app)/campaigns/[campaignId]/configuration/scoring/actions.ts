"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { logActivity } from "@/lib/activity-log";
import { PermissionKey } from "@/generated/prisma/enums";

// Phase 1 scoring configuration mutations. Every action is:
//   - gated by CONFIGURE_SCREENING, re-checked server-side here (not just
//     hidden in the UI) — a direct POST still hits requirePermission;
//   - scoped to the campaignId from the route — a question or config row is
//     only ever touched after confirming it belongs to that campaign, so
//     nothing leaks or mutates across campaigns;
//   - audited via logActivity with the agreed PHASE1_* actionTypes.

const SCREEN = PermissionKey.CONFIGURE_SCREENING;

function pathFor(campaignId: string) {
  return `/campaigns/${campaignId}/configuration`;
}

// The note scale UI offers a fixed vocabulary: 0 and 1 are always present and
// not removable; 0.25 / 0.5 / 0.75 are optional midpoints. We never trust the
// array the client sends — we clamp it to that vocabulary, force 0 and 1 in,
// dedupe, and sort ascending before it ever reaches the database.
const ALLOWED_MIDPOINTS = [0.25, 0.5, 0.75];
function sanitizeNoteScale(input: number[]): number[] {
  const midpoints = ALLOWED_MIDPOINTS.filter((m) => input.includes(m));
  return [0, ...midpoints, 1].sort((a, b) => a - b);
}

// Coefficients are non-negative finite numbers. A blank/NaN input becomes 0
// rather than throwing, so a half-filled new question is still saveable.
function sanitizeCoefficient(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return value;
}

export type QuestionDTO = {
  id: string;
  text: string;
  coefficient: number;
  noteScale: number[];
  order: number;
  isActive: boolean;
  requiresTechnicalScorer: boolean;
  scoreCount: number;
};

// Load a question only if it belongs to the given campaign. Returns null for a
// missing question OR one owned by a different campaign — callers treat both as
// "not yours", the guard that keeps mutations campaign-scoped.
async function findOwnedQuestion(campaignId: string, questionId: string) {
  const question = await prisma.phaseOneQuestion.findUnique({
    where: { id: questionId },
    select: {
      id: true,
      campaignId: true,
      text: true,
      order: true,
    },
  });
  if (!question || question.campaignId !== campaignId) return null;
  return question;
}

// Create a new question at the end of the campaign's order. Defaults per spec:
// note scale [0, 0.5, 1], coefficient 0 — a TM Lead fills in real values after.
export async function createPhaseOneQuestion(
  campaignId: string,
): Promise<QuestionDTO> {
  const actorId = await requirePermission(SCREEN);

  const agg = await prisma.phaseOneQuestion.aggregate({
    where: { campaignId },
    _max: { order: true },
  });
  const nextOrder = (agg._max.order ?? 0) + 1;

  const created = await prisma.phaseOneQuestion.create({
    data: {
      campaignId,
      text: "New question",
      coefficient: 0,
      noteScale: [0, 0.5, 1],
      order: nextOrder,
      requiresTechnicalScorer: false,
    },
  });

  await logActivity({
    actorId,
    actionType: "PHASE1_QUESTION_CREATED",
    targetType: "PhaseOneQuestion",
    targetId: created.id,
    campaignId,
    details: { campaignId, order: created.order },
  });

  revalidatePath(pathFor(campaignId));

  return {
    id: created.id,
    text: created.text,
    coefficient: created.coefficient,
    noteScale: created.noteScale,
    order: created.order,
    isActive: created.isActive,
    requiresTechnicalScorer: created.requiresTechnicalScorer,
    scoreCount: 0,
  };
}

export type QuestionPatch = {
  text?: string;
  coefficient?: number;
  noteScale?: number[];
  isActive?: boolean;
  requiresTechnicalScorer?: boolean;
};

// Update one or more fields of a single question. Only the keys present in the
// patch are written, so the client can persist a single field (e.g. an edited
// coefficient) without clobbering the others.
export async function updatePhaseOneQuestion(
  campaignId: string,
  questionId: string,
  patch: QuestionPatch,
): Promise<void> {
  const actorId = await requirePermission(SCREEN);

  const owned = await findOwnedQuestion(campaignId, questionId);
  if (!owned) return;

  const data: QuestionPatch = {};
  if (patch.text !== undefined) data.text = patch.text.trim() || "Untitled question";
  if (patch.coefficient !== undefined)
    data.coefficient = sanitizeCoefficient(patch.coefficient);
  if (patch.noteScale !== undefined)
    data.noteScale = sanitizeNoteScale(patch.noteScale);
  if (patch.isActive !== undefined) data.isActive = patch.isActive;
  if (patch.requiresTechnicalScorer !== undefined)
    data.requiresTechnicalScorer = patch.requiresTechnicalScorer;

  if (Object.keys(data).length === 0) return;

  await prisma.phaseOneQuestion.update({
    where: { id: questionId },
    data,
  });

  await logActivity({
    actorId,
    actionType: "PHASE1_QUESTION_UPDATED",
    targetType: "PhaseOneQuestion",
    targetId: questionId,
    campaignId,
    details: { campaignId, changed: Object.keys(data) },
  });

  revalidatePath(pathFor(campaignId));
}

// Delete a question. PhaseOneScore rows cascade (schema onDelete: Cascade); the
// UI warns about that before calling here. The delete is still gated + scoped.
export async function deletePhaseOneQuestion(
  campaignId: string,
  questionId: string,
): Promise<void> {
  const actorId = await requirePermission(SCREEN);

  const owned = await findOwnedQuestion(campaignId, questionId);
  if (!owned) return;

  const scoreCount = await prisma.phaseOneScore.count({
    where: { questionId },
  });

  await prisma.phaseOneQuestion.delete({ where: { id: questionId } });

  await logActivity({
    actorId,
    actionType: "PHASE1_QUESTION_DELETED",
    targetType: "PhaseOneQuestion",
    targetId: questionId,
    campaignId,
    details: { campaignId, text: owned.text, scoresDeleted: scoreCount },
  });

  revalidatePath(pathFor(campaignId));
}

// Persist a new ordering. `orderedIds` is the campaign's full question set in
// the desired order. Because @@unique([campaignId, order]) forbids two rows
// sharing an order even transiently, we rewrite in two passes inside one
// transaction: first to negative temp orders (which can never collide with the
// final positive ones), then to the final 1..N sequence.
export async function reorderPhaseOneQuestions(
  campaignId: string,
  orderedIds: string[],
): Promise<void> {
  const actorId = await requirePermission(SCREEN);

  const existing = await prisma.phaseOneQuestion.findMany({
    where: { campaignId },
    select: { id: true },
  });
  const existingIds = new Set(existing.map((q) => q.id));

  // Reject unless orderedIds is exactly the campaign's question set — this both
  // enforces campaign scoping and guards against a stale/partial client list.
  const sameSize = orderedIds.length === existingIds.size;
  const allBelong = orderedIds.every((id) => existingIds.has(id));
  if (!sameSize || !allBelong) return;

  await prisma.$transaction([
    ...orderedIds.map((id, i) =>
      prisma.phaseOneQuestion.update({
        where: { id },
        data: { order: -(i + 1) },
      }),
    ),
    ...orderedIds.map((id, i) =>
      prisma.phaseOneQuestion.update({
        where: { id },
        data: { order: i + 1 },
      }),
    ),
  ]);

  await logActivity({
    actorId,
    actionType: "PHASE1_QUESTIONS_REORDERED",
    targetType: "PhaseOneQuestion",
    targetId: campaignId,
    campaignId,
    details: { campaignId, order: orderedIds },
  });

  revalidatePath(pathFor(campaignId));
}

// Upsert the campaign's PhaseOneConfig. rejectThreshold / targetCount are
// optional — an empty field clears the value (null) rather than forcing a 0.
export async function updatePhaseOneConfig(
  campaignId: string,
  rejectThreshold: number | null,
  targetCount: number | null,
): Promise<void> {
  const actorId = await requirePermission(SCREEN);

  const reject =
    rejectThreshold !== null && Number.isFinite(rejectThreshold) && rejectThreshold >= 0
      ? rejectThreshold
      : null;
  const target =
    targetCount !== null && Number.isInteger(targetCount) && targetCount >= 0
      ? targetCount
      : null;

  await prisma.phaseOneConfig.upsert({
    where: { campaignId },
    create: { campaignId, rejectThreshold: reject, targetCount: target },
    update: { rejectThreshold: reject, targetCount: target },
  });

  await logActivity({
    actorId,
    actionType: "PHASE1_CONFIG_UPDATED",
    targetType: "PhaseOneConfig",
    targetId: campaignId,
    campaignId,
    details: { campaignId, rejectThreshold: reject, targetCount: target },
  });

  revalidatePath(pathFor(campaignId));
}
