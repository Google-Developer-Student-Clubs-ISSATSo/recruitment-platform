import "dotenv/config";

import { prisma } from "../src/lib/prisma";
import {
  hasAnyPermission,
  canEditInterviewNote,
  canViewInterviewNote,
} from "../src/lib/permissions";
import {
  CAMPAIGN_PAGE_PERMISSIONS,
  PLATFORM_PAGE_PERMISSIONS,
  CAMPAIGN_CREATE_PERMISSIONS,
  pageAccessKeys,
} from "../src/lib/route-permissions";
import { PermissionKey, Committee } from "../src/generated/prisma/enums";

/**
 * RBAC verification pass — the proportionate equivalent of a pen test for this
 * app. It walks every gated surface and, for every seeded user, checks the SAME
 * predicate the real guard evaluates:
 *
 *   - route guards call `requirePermission` / manual `hasPermission`, which deny
 *     unless the user holds the required key;
 *   - "any of" pages and the campaign-create actions call `hasAnyPermission`.
 *
 * So evaluating `hasAnyPermission(user, requiredKeys)` here reproduces the gate's
 * allow/deny decision exactly — these are the production functions, imported, not
 * a re-implementation. For each gate we assert BOTH directions:
 *   - a user who lacks ALL required keys must be DENIED (the pen-test case);
 *   - a user who holds ≥1 required key must be ALLOWED (positive control, so a
 *     gate that denies everyone can't masquerade as "secure").
 *
 * A second section exercises the interview-note seat/closed-state logic with
 * throwaway fixtures (cleaned up at the end).
 *
 * Run: npx tsx --env-file=.env scripts/audit-rbac.ts
 */

type Gate = { surface: string; keys: readonly PermissionKey[] };
type SeededUser = { id: string; email: string; keys: Set<string> };

let pass = 0;
let fail = 0;
const failures: string[] = [];

function record(ok: boolean, line: string) {
  if (ok) pass++;
  else {
    fail++;
    failures.push(line);
  }
  console.log(`${ok ? "PASS" : "FAIL"}  ${line}`);
}

// The full gate matrix. Pages come from the authoritative route-permission map;
// server actions are listed with the exact permission constant each one checks
// (verified against their actions.ts). "any of" semantics throughout.
function buildGates(): Gate[] {
  const gates: Gate[] = [];

  for (const [page, entry] of Object.entries(CAMPAIGN_PAGE_PERMISSIONS)) {
    gates.push({ surface: `page /campaigns/[id]/${page}`, keys: pageAccessKeys(entry) });
  }
  for (const [path, key] of Object.entries(PLATFORM_PAGE_PERMISSIONS)) {
    gates.push({ surface: `page ${path}`, keys: [key] });
  }
  gates.push({ surface: "page /admin/*", keys: [PermissionKey.MANAGE_ACCOUNTS] });

  const K = PermissionKey;
  const action: Array<[string, PermissionKey[]]> = [
    ["action previewImport / confirmImport (CSV)", [K.IMPORT_APPLICANTS]],
    ["action savePhaseOneScore (non-technical question)", [K.SCREEN_PHASE1]],
    ["action savePhaseOneScore (technical question)", [K.ENTER_TECHNICAL_SCORE]],
    ["action phase1 selection finalize/override/recalc", [K.SCREEN_PHASE1]],
    ["action phase1 send result emails", [K.SEND_EMAILS]],
    ["action scoring configuration (add/edit questions)", [K.CONFIGURE_SCREENING]],
    ["action committee capacity update", [K.MANAGE_CAPACITY]],
    ["action final-decision email links", [K.SEND_EMAILS]],
    ["action final-decision record/complete", [K.ENTER_FINAL_DECISION]],
    ["action final-decision send emails", [K.SEND_EMAILS]],
    ["action interview booking invite/reminder send", [K.SEND_EMAILS]],
    ["action interview slot entry", [K.ENTER_INTERVIEW_SLOT]],
    ["action claim/release panel seat", [K.CLAIM_PANEL_SEAT]],
    ["action createUser / deleteUser / togglePermission / bulk / reset", [K.MANAGE_ACCOUNTS]],
    ["action transfer admin role", [K.MANAGE_ACCOUNTS]],
    ["action reopen closed interview note", [K.MANAGE_ACCOUNTS]],
    ["action campaign create/delete/open-close", [...CAMPAIGN_CREATE_PERMISSIONS]],
  ];
  for (const [surface, keys] of action) gates.push({ surface, keys });

  return gates;
}

async function auditGateMatrix(users: SeededUser[]) {
  console.log("\n=== SECTION 1: page & server-action gate matrix ===\n");
  const gates = buildGates();

  for (const gate of gates) {
    for (const u of users) {
      const holds = gate.keys.some((k) => u.keys.has(k));
      // The production predicate — the real allow/deny decision.
      const allowed = await hasAnyPermission(u.id, gate.keys);

      if (holds) {
        // Positive control: a holder must be allowed.
        record(
          allowed,
          `${gate.surface} :: holder ${u.email} ALLOWED (expected allow)`,
        );
      } else {
        // The pen-test case: a user lacking every key must be denied.
        record(
          !allowed,
          `${gate.surface} :: non-holder ${u.email} DENIED (expected deny)`,
        );
      }
    }
  }
}

// --- Section 2: interview-note seat / closed-state authorization -------------

async function auditInterviewNoteLogic(users: SeededUser[]) {
  console.log("\n=== SECTION 2: interview-note access (seat + closed state) ===\n");

  const lead = users.find((u) => u.keys.has(PermissionKey.MANAGE_ACCOUNTS));
  const panelist = users.find(
    (u) =>
      u.keys.has(PermissionKey.EDIT_OWN_INTERVIEW_NOTES) &&
      !u.keys.has(PermissionKey.MANAGE_ACCOUNTS),
  );
  if (!lead || !panelist) {
    console.log("SKIP  missing a lead or panelist identity to test with.");
    return;
  }

  // Throwaway fixture: campaign → applicant → panel → seat claimed by panelist.
  const campaign = await prisma.campaign.create({
    data: { name: `__rbac_audit_${Date.now()}`, isOpen: true },
    select: { id: true },
  });
  const applicant = await prisma.applicant.create({
    data: {
      campaignId: campaign.id,
      fullName: "RBAC Audit Fixture",
      email: `rbac_${Date.now()}@example.test`,
      isIssatsoStudent: true,
      preferredCommittee: Committee.TM,
      rawFormData: {},
      status: "SHORTLISTED",
    },
    select: { id: true },
  });
  const panel = await prisma.interviewPanel.create({
    data: { applicantId: applicant.id },
    select: { id: true },
  });
  await prisma.panelSeat.create({
    data: {
      panelId: panel.id,
      committee: Committee.TM,
      claimedById: panelist.id,
    },
  });

  const aId = applicant.id;
  try {
    // Open note.
    record(await canEditInterviewNote(panelist.id, aId), `OPEN  panelist-with-seat CAN edit`);
    record(await canEditInterviewNote(lead.id, aId), `OPEN  lead (MANAGE_ACCOUNTS) CAN edit`);
    // A holder of EDIT_OWN but NO seat on THIS panel must be refused edit.
    const otherPanelist = users.find(
      (u) =>
        u.id !== panelist.id &&
        u.keys.has(PermissionKey.EDIT_OWN_INTERVIEW_NOTES) &&
        !u.keys.has(PermissionKey.MANAGE_ACCOUNTS),
    );
    if (otherPanelist) {
      record(
        !(await canEditInterviewNote(otherPanelist.id, aId)),
        `OPEN  EDIT_OWN holder WITHOUT a seat CANNOT edit (${otherPanelist.email})`,
      );
      // The rule that replaced the deleted VIEW_COMMITTEE_DASHBOARD preview:
      // being off the panel now means no READ either, not just no write. No
      // permission flag grants a look at someone else's interview note.
      record(
        !(await canViewInterviewNote(otherPanelist.id, aId)),
        `OPEN  non-panel member CANNOT view (${otherPanelist.email})`,
      );
    }
    // Every non-lead identity that isn't on this panel must be refused a read,
    // whatever bundle they hold — the exhaustive form of the check above.
    for (const u of users) {
      if (u.id === panelist.id || u.keys.has(PermissionKey.MANAGE_ACCOUNTS)) continue;
      record(
        !(await canViewInterviewNote(u.id, aId)),
        `OPEN  off-panel ${u.email} CANNOT view (no dashboard-style fallback)`,
      );
    }

    // Close the note → locks to MANAGE_ACCOUNTS only.
    await prisma.interviewNote.upsert({
      where: { applicantId: aId },
      create: { applicantId: aId, closedAt: new Date(), closedById: lead.id },
      update: { closedAt: new Date(), closedById: lead.id },
    });
    record(!(await canEditInterviewNote(panelist.id, aId)), `CLOSED panelist CANNOT edit`);
    record(!(await canViewInterviewNote(panelist.id, aId)), `CLOSED panelist CANNOT view`);
    record(await canEditInterviewNote(lead.id, aId), `CLOSED lead CAN still edit`);
    record(await canViewInterviewNote(lead.id, aId), `CLOSED lead CAN still view`);

    // Reopen → access restored.
    await prisma.interviewNote.update({
      where: { applicantId: aId },
      data: { closedAt: null, closedById: null },
    });
    record(await canEditInterviewNote(panelist.id, aId), `REOPENED panelist CAN edit again`);
  } finally {
    // Cleanup — remove the fixture regardless of outcome.
    await prisma.interviewNote.deleteMany({ where: { applicantId: aId } });
    await prisma.panelSeat.deleteMany({ where: { panelId: panel.id } });
    await prisma.interviewPanel.deleteMany({ where: { id: panel.id } });
    await prisma.applicant.deleteMany({ where: { id: aId } });
    await prisma.campaign.deleteMany({ where: { id: campaign.id } });
  }
}

async function main() {
  const rows = await prisma.user.findMany({
    select: { id: true, email: true, permissions: { select: { permission: true } } },
    orderBy: { email: "asc" },
  });
  const users: SeededUser[] = rows.map((u) => ({
    id: u.id,
    email: u.email,
    keys: new Set(u.permissions.map((p) => p.permission)),
  }));
  console.log(`Loaded ${users.length} seeded users as test identities.`);

  await auditGateMatrix(users);
  await auditInterviewNoteLogic(users);

  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  if (fail > 0) {
    console.log("\nFAILURES:");
    for (const f of failures) console.log("  - " + f);
  }
  await prisma.$disconnect();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("audit-rbac crashed:", e);
  process.exit(2);
});
