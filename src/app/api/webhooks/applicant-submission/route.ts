import { createHash, timingSafeEqual } from "node:crypto";

import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity-log";
import { rateLimit } from "@/lib/rate-limit";
import {
  applicantCreateData,
  classifyApplicantRow,
  rawRowFromFormData,
} from "@/lib/applicant-intake";
import {
  PhaseOneClassification,
  RoleTemplateName,
} from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

// Live applicant intake from the Google Form. The Form's bound Apps Script
// (docs/google-apps-script/on-form-submit.gs — pasted into Google's editor, NOT
// deployed from this repo; see docs/GOOGLE_FORM_SYNC_SETUP.md) POSTs one
// submission here per response.
//
// This is the only route in the app that is not behind an Auth.js session:
// Google's servers have no session, so it authenticates with a shared secret
// header instead. Everything past that check — the validation, the
// auto-reject-on-non-ISSATSO rule, the fields written — is the same code the
// CSV import runs (@/lib/applicant-intake), so the two intake paths can't drift.

const SECRET_HEADER = "X-Webhook-Secret";

// One applicant per call, so the ceiling is set by real submission bursts (a
// promo push can land dozens of responses in a minute), not by batch size.
// Keyed by route rather than by caller: every legitimate request comes from
// Google's fleet, where a per-IP key would be meaningless.
const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60_000;

/** Generic 401 — never says whether the secret was absent, short, or close. */
function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

/**
 * Constant-time secret comparison. Both sides are SHA-256'd first so the
 * operands are always 32 bytes: timingSafeEqual throws on a length mismatch,
 * and that throw would itself leak the secret's length.
 */
function secretMatches(provided: string, expected: string): boolean {
  return timingSafeEqual(
    createHash("sha256").update(provided).digest(),
    createHash("sha256").update(expected).digest(),
  );
}

/**
 * Whose name a webhook-originated activity entry carries. A webhook has no
 * signed-in user and ActivityLogEntry.actorId is a real User foreign key, so
 * the Administrator (the single TM Lead) stands in as the responsible account —
 * the distinct action type and `source` detail are what tell a reader this came
 * from the Form rather than from a person. Null on a database with no
 * Administrator, which is a setup gap, not a reason to drop an applicant.
 */
async function administratorId(): Promise<string | null> {
  const admin = await prisma.user.findFirst({
    where: { roleTemplate: { name: RoleTemplateName.TM_LEAD } },
    select: { id: true },
  });
  return admin?.id ?? null;
}

export async function POST(request: Request) {
  const expected = process.env.APPLICANT_WEBHOOK_SECRET;
  const provided = request.headers.get(SECRET_HEADER);
  // An unset secret is a deployment mistake, not an invitation — it fails
  // closed, and looks identical from the outside to a wrong secret.
  if (!expected || !provided || !secretMatches(provided, expected)) {
    if (!expected) {
      console.error(
        "[applicant-submission] APPLICANT_WEBHOOK_SECRET is not set — every submission will be rejected.",
      );
    }
    return unauthorized();
  }

  const gate = rateLimit("applicant-submission", RATE_LIMIT, RATE_WINDOW_MS);
  if (!gate.ok) {
    return Response.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(gate.retryAfterSeconds) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  const payload = body as { campaignId?: unknown; responses?: unknown };

  if (
    !payload.responses ||
    typeof payload.responses !== "object" ||
    Array.isArray(payload.responses)
  ) {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  // campaignId is required and never inferred. Several campaigns can be open at
  // once by design, so there is no safe way to guess which pool a submission
  // belongs to — a wrong guess silently contaminates a campaign's applicant
  // list, which is worse than refusing the request.
  if (typeof payload.campaignId !== "string" || !payload.campaignId) {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  const campaignId = payload.campaignId;
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true, isOpen: true },
  });
  if (!campaign) {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  // A closed campaign is an archive — the club has finished recruiting for it,
  // and a late submission landing in that pool would quietly alter a finished
  // cycle's numbers. Refused before anything is classified or written, so a
  // stale Form pointed at last year's campaign changes nothing.
  if (!campaign.isOpen) {
    return Response.json(
      { error: "This campaign is not currently accepting applications." },
      { status: 400 },
    );
  }

  // Coerce every answer to a string, exactly as a CSV cell would arrive: the
  // rawFormData both intake paths store has to stay the same shape, since
  // PhaseOneQuestion.sourceField reads scored answers straight out of it.
  const rawFormData: Record<string, string> = {};
  for (const [key, value] of Object.entries(
    payload.responses as Record<string, unknown>,
  )) {
    rawFormData[key] = value == null ? "" : String(value);
  }

  const raw = rawRowFromFormData(rawFormData);
  const email = raw.email.trim().toLowerCase();

  // Point-query duplicate check — the single-row equivalent of the CSV import's
  // pre-fetched email set. Apps Script retries a failed trigger, so receiving
  // the same submission twice is expected and must never be an error.
  const existing = email
    ? await prisma.applicant.findUnique({
        where: { campaignId_email: { campaignId, email } },
        select: { id: true },
      })
    : null;

  const row = classifyApplicantRow(raw, new Set(existing ? [email] : []));

  if (row.status === "error") {
    return Response.json(
      { status: "rejected", reason: row.reason },
      { status: 400 },
    );
  }
  if (row.status === "duplicate") {
    return Response.json(
      { status: "skipped", reason: "already exists", applicantId: existing!.id },
      { status: 200 },
    );
  }

  let applicantId: string;
  try {
    const created = await prisma.applicant.create({
      data: {
        ...applicantCreateData(row, campaignId),
        rawFormData: row.rawFormData as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    applicantId = created.id;
  } catch (error) {
    // P2002 on @@unique([campaignId, email]) — a retry landed between the check
    // above and this insert. The row exists, which is the outcome we wanted.
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return Response.json(
        { status: "skipped", reason: "already exists" },
        { status: 200 },
      );
    }
    throw error;
  }

  // Only a scoreable applicant gets a PhaseOneResult; an auto-rejected
  // non-ISSATSO submission has nothing to score — same as via CSV import.
  if (row.status === "import") {
    await prisma.phaseOneResult.create({
      data: { applicantId, classification: PhaseOneClassification.PENDING },
    });
  }

  const actorId = await administratorId();
  if (actorId) {
    await logActivity({
      actorId,
      actionType: "APPLICANT_SUBMITTED_VIA_FORM",
      targetType: "Applicant",
      targetId: applicantId,
      campaignId,
      details: {
        source: "google_form_webhook",
        email: row.email,
        outcome: row.status === "auto_reject" ? "auto-rejected" : "imported",
      },
    });
  } else {
    console.error(
      `[applicant-submission] No Administrator (TM_LEAD) in the database — skipped the activity log entry for applicant ${applicantId}.`,
    );
  }

  return Response.json(
    { status: "created", applicantId, outcome: row.status },
    { status: 201 },
  );
}
