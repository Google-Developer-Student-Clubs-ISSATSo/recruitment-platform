"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { logActivity } from "@/lib/activity-log";
import {
  ApplicantStatus,
  PermissionKey,
  PhaseOneClassification,
} from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import {
  classifyCsv,
  summarize,
  toPreviewRow,
  type ImportSummary,
  type PreviewRow,
} from "./parse";

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
// creates only "import" and "auto_reject" rows in a single transaction:
//   - import      → status SUBMITTED + a PhaseOneResult (PENDING) to score
//   - auto_reject → status REJECTED_PHASE1, NO PhaseOneResult (nothing to score)
// One APPLICANTS_IMPORTED activity entry summarizes the whole run.
export async function confirmImport(
  campaignId: string,
  csvText: string,
): Promise<ConfirmResult> {
  const actorId = await requirePermission(IMPORT);

  const existing = await existingEmailsFor(campaignId);
  const { rows, headerError } = classifyCsv(csvText, existing);
  if (headerError) return { ok: false, error: headerError };

  const toCreate = rows.filter(
    (r) => r.status === "import" || r.status === "auto_reject",
  );

  const creates = toCreate.map((r) => {
    const data: Prisma.ApplicantCreateInput = {
      campaign: { connect: { id: campaignId } },
      fullName: r.fullName,
      email: r.email,
      isIssatsoStudent: r.isIssatsoStudent!,
      preferredCommittee: r.preferredCommittee!,
      rawFormData: r.rawFormData as Prisma.InputJsonValue,
      status:
        r.status === "auto_reject"
          ? ApplicantStatus.REJECTED_PHASE1
          : ApplicantStatus.SUBMITTED,
      // Only scoreable (imported) applicants get a PhaseOneResult row.
      ...(r.status === "import"
        ? {
            phaseOneResult: {
              create: { classification: PhaseOneClassification.PENDING },
            },
          }
        : {}),
    };
    return prisma.applicant.create({ data });
  });

  await prisma.$transaction(creates);

  const summary = summarize(rows);
  await logActivity({
    actorId,
    actionType: "APPLICANTS_IMPORTED",
    targetType: "Campaign",
    targetId: campaignId,
    details: {
      totalRows: summary.totalRows,
      imported: summary.imported,
      autoRejected: summary.autoRejected,
      duplicatesSkipped: summary.duplicatesSkipped,
      errors: summary.errors,
    },
  });

  revalidatePath(`/campaigns/${campaignId}/applicants`);
  return { ok: true, summary };
}
