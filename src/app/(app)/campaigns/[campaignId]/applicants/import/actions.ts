"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { logActivity } from "@/lib/activity-log";
import { PermissionKey, PhaseOneClassification } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { applicantCreateData } from "@/lib/applicant-intake";
import {
  classifyCsv,
  summarize,
  toPreviewRow,
  MAX_CSV_BYTES,
  type ImportSummary,
  type PreviewRow,
} from "./parse";

// Reject an oversized payload before parsing it. The client guards too, but a
// server action is a public endpoint — a direct caller can send any string.
function tooLarge(csvText: string): boolean {
  return Buffer.byteLength(csvText, "utf8") > MAX_CSV_BYTES;
}

const TOO_LARGE_MESSAGE = "That file is too large. The limit is 5 MB.";

// CSV applicant import. Both actions are gated by IMPORT_APPLICANTS (re-checked
// server-side, not just hidden) and operate ONLY on the campaignId from the
// route: duplicate detection and the committed rows are both scoped to that
// campaign, so an import can never touch another campaign's pool.

const IMPORT = PermissionKey.IMPORT_APPLICANTS;

export type PreviewResult =
  | { ok: true; rows: PreviewRow[]; summary: ImportSummary }
  | { ok: false; error: string };

export type ConfirmResult =
  | { ok: true; summary: ImportSummary }
  | { ok: false; error: string };

// Lowercased set of emails already in this campaign — the campaign-scoped basis
// for duplicate detection.
async function existingEmailsFor(campaignId: string): Promise<Set<string>> {
  const existing = await prisma.applicant.findMany({
    where: { campaignId },
    select: { email: true },
  });
  return new Set(existing.map((a) => a.email.toLowerCase()));
}

// Parse + classify without writing anything. Drives the preview table.
export async function previewImport(
  campaignId: string,
  csvText: string,
): Promise<PreviewResult> {
  await requirePermission(IMPORT);
  if (tooLarge(csvText)) return { ok: false, error: TOO_LARGE_MESSAGE };

  const existing = await existingEmailsFor(campaignId);
  const { rows, headerError } = classifyCsv(csvText, existing);
  if (headerError) return { ok: false, error: headerError };
  if (rows.length === 0)
    return { ok: false, error: "No data rows found in the file." };

  return {
    ok: true,
    rows: rows.map(toPreviewRow),
    summary: summarize(rows),
  };
}

// Commit the import. Re-parses and re-classifies from the raw text (so the
// duplicate check runs against the CURRENT database, not a stale preview), then
// creates only "import" and "auto_reject" rows:
//   - import      → status SUBMITTED + a PhaseOneResult (PENDING) to score
//   - auto_reject → status REJECTED_PHASE1, NO PhaseOneResult (nothing to score)
// One APPLICANTS_IMPORTED activity entry summarizes the whole run.
//
// Batched into a small, fixed number of round trips regardless of row count —
// this used to be prisma.applicant.create() looped inside a $transaction, one
// round trip per row, which blew past Prisma's 5000ms interactive-transaction
// timeout on Neon once there were enough rows. createMany() can't return the
// created rows, so getting PhaseOneResult ids to attach requires one read-back
// query in between; that data dependency (step 4 needs ids step 3 produces) is
// also why this isn't wrapped in an array-form $transaction — the array form
// needs every query built up front, before any result is known. Each step
// already touches only campaignId-scoped rows.
export async function confirmImport(
  campaignId: string,
  csvText: string,
): Promise<ConfirmResult> {
  console.time("confirmImport:total");
  const actorId = await requirePermission(IMPORT);
  if (tooLarge(csvText)) return { ok: false, error: TOO_LARGE_MESSAGE };

  console.time("confirmImport:existingEmails");
  const existing = await existingEmailsFor(campaignId);
  console.timeEnd("confirmImport:existingEmails");

  const { rows, headerError } = classifyCsv(csvText, existing);
  if (headerError) return { ok: false, error: headerError };

  const toCreate = rows.filter(
    (r) => r.status === "import" || r.status === "auto_reject",
  );

  if (toCreate.length > 0) {
    console.time("confirmImport:createApplicants");
    await prisma.applicant.createMany({
      data: toCreate.map((r) => ({
        ...applicantCreateData(r, campaignId),
        rawFormData: r.rawFormData as Prisma.InputJsonValue,
      })),
    });
    console.timeEnd("confirmImport:createApplicants");

    const scoreableEmails = toCreate
      .filter((r) => r.status === "import")
      .map((r) => r.email);

    if (scoreableEmails.length > 0) {
      console.time("confirmImport:readBackIds");
      const created = await prisma.applicant.findMany({
        where: { campaignId, email: { in: scoreableEmails } },
        select: { id: true },
      });
      console.timeEnd("confirmImport:readBackIds");

      console.time("confirmImport:createPhaseOneResults");
      await prisma.phaseOneResult.createMany({
        data: created.map((a) => ({
          applicantId: a.id,
          classification: PhaseOneClassification.PENDING,
        })),
      });
      console.timeEnd("confirmImport:createPhaseOneResults");
    }
  }

  const summary = summarize(rows);
  await logActivity({
    actorId,
    actionType: "APPLICANTS_IMPORTED",
    targetType: "Campaign",
    targetId: campaignId,
    campaignId,
    details: {
      totalRows: summary.totalRows,
      imported: summary.imported,
      autoRejected: summary.autoRejected,
      duplicatesSkipped: summary.duplicatesSkipped,
      errors: summary.errors,
    },
  });

  revalidatePath(`/campaigns/${campaignId}/applicants`);
  console.timeEnd("confirmImport:total");
  return { ok: true, summary };
}
