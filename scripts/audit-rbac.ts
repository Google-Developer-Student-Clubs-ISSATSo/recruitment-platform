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
import {
  assignPanelSeat,
  reassignPanelSeat,
  respondToSeatApproval,
} from "../src/lib/panel-seat";
import {
  PermissionKey,
  ApprovalStatus,
  Committee,
  LeadRole,
  PanelSeatKind,
} from "../src/generated/prisma/enums";

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
 * Two further sections exercise authorization that is NOT a permission grant, so
 * Section 1's matrix cannot express it, using throwaway fixtures cleaned up at
 * the end: the interview-note seat/closed-state logic, and panel-seat authority
 * (which lead currently holds which title, resolved live).
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
    // The panel-staffing actions are deliberately ABSENT from this matrix, and
    // so is the Interviews page: neither checks a permission key any more. The
    // page is open to every signed-in member (like Statistics), and which seats
    // a caller may touch is resolved per-seat from the live CampaignLead rows —
    // authority this section has no way to express, since it is not a permission
    // grant at all. Section 3 covers it directly instead.
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
      kind: PanelSeatKind.TM,
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

// --- Section 3: panel-seat authority (live lead resolution) ------------------

/**
 * The lock that replaced the panel actions' old CLAIM_PANEL_SEAT gate.
 *
 * Section 1 can't cover this: the authority is not a permission grant at all,
 * it is "are you the current holder of this campaign's MKT/EER/Club lead title",
 * resolved live from CampaignLead on every call. So it is exercised here against
 * the real helpers with a throwaway campaign, the same way Section 2 does for
 * interview notes.
 *
 * The applicant is deliberately an EER applicant, because two of the rules only
 * exist relative to the committee they applied to.
 */
async function auditPanelSeatAuthority(users: SeededUser[]) {
  console.log("\n=== SECTION 3: panel-seat authority (live lead holders) ===\n");

  const admin = users.find((u) => u.keys.has(PermissionKey.MANAGE_ACCOUNTS));
  const eligible = await prisma.user.findMany({
    where: {
      permissions: { some: { permission: PermissionKey.CLAIM_PANEL_SEAT } },
    },
    select: { id: true, email: true, committee: true },
    orderBy: { email: "asc" },
  });
  const pick = (committee: Committee, exclude: string[]) =>
    eligible.find((u) => u.committee === committee && !exclude.includes(u.id));

  // Everyone here must be a distinct identity, or an assertion could pass for
  // the wrong reason (e.g. "the outsider was refused" when they were the lead).
  const mktLead = pick(Committee.MKT, admin ? [admin.id] : []);
  const mktMember = pick(Committee.MKT, [admin?.id ?? "", mktLead?.id ?? ""]);
  const eerLead = pick(Committee.EER, [admin?.id ?? ""]);
  const clubLead = pick(Committee.TM, [admin?.id ?? ""]);
  const tmMember = pick(Committee.TM, [admin?.id ?? "", clubLead?.id ?? ""]);

  if (!admin || !mktLead || !mktMember || !eerLead || !clubLead || !tmMember) {
    console.log("SKIP  need an admin plus 2 MKT, 1 EER and 2 TM panel-eligible users.");
    return;
  }

  const campaign = await prisma.campaign.create({
    data: { name: `__rbac_seats_${Date.now()}`, isOpen: true },
    select: { id: true },
  });
  const applicant = await prisma.applicant.create({
    data: {
      campaignId: campaign.id,
      fullName: "RBAC Seat Fixture",
      email: `rbac_seat_${Date.now()}@example.test`,
      isIssatsoStudent: true,
      preferredCommittee: Committee.EER,
      rawFormData: {},
      status: "SHORTLISTED",
    },
    select: { id: true },
  });
  // A four-seat panel, so the floating seat's rules are covered too.
  const panel = await prisma.interviewPanel.create({
    data: {
      applicantId: applicant.id,
      seats: {
        create: [
          { kind: PanelSeatKind.MKT },
          { kind: PanelSeatKind.TM },
          { kind: PanelSeatKind.EER },
          { kind: PanelSeatKind.FLOATING },
        ],
      },
    },
    select: { id: true, seats: { select: { id: true, kind: true } } },
  });
  const seatOf = (kind: PanelSeatKind) =>
    panel.seats.find((s) => s.kind === kind)!.id;

  // The titles under test. Written directly rather than via assignCampaignLead
  // so the fixture doesn't spray activity-log entries into the real log.
  await prisma.campaignLead.createMany({
    data: [
      { campaignId: campaign.id, role: LeadRole.MKT_LEAD, userId: mktLead.id, assignedById: admin.id },
      { campaignId: campaign.id, role: LeadRole.EER_LEAD, userId: eerLead.id, assignedById: admin.id },
      { campaignId: campaign.id, role: LeadRole.CLUB_LEAD, userId: clubLead.id, assignedById: admin.id },
    ],
  });

  /** Empty every seat and drop any request, so each phase starts clean. */
  const resetSeats = async () => {
    await prisma.panelSeatApprovalRequest.deleteMany({
      where: { seat: { panelId: panel.id } },
    });
    await prisma.panelSeat.updateMany({
      where: { panelId: panel.id },
      data: { claimedById: null, claimedAt: null },
    });
  };

  const cid = campaign.id;
  try {
    // --- Refusals: nobody touches a seat that isn't theirs ---
    record(
      !(await assignPanelSeat(cid, seatOf(PanelSeatKind.MKT), mktMember.id, mktMember.id)).ok,
      `ordinary member CANNOT assign the MKT seat (${mktMember.email})`,
    );
    record(
      !(await assignPanelSeat(cid, seatOf(PanelSeatKind.EER), eerLead.id, mktLead.id)).ok,
      `MKT lead CANNOT assign the EER seat`,
    );
    record(
      !(await assignPanelSeat(cid, seatOf(PanelSeatKind.TM), tmMember.id, mktLead.id)).ok,
      `MKT lead CANNOT assign the TM seat`,
    );

    // --- The Club Lead may not stand in for the applicant's own committee ---
    const ownCommittee = await assignPanelSeat(
      cid,
      seatOf(PanelSeatKind.EER),
      clubLead.id,
      clubLead.id,
    );
    record(
      !ownCommittee.ok,
      `Club Lead CANNOT take the EER seat of an EER applicant (refused outright)`,
    );
    record(
      (await prisma.panelSeatApprovalRequest.count({
        where: { seatId: seatOf(PanelSeatKind.EER) },
      })) === 0,
      `Club Lead's barred seat raises NO approval request (not even offered)`,
    );

    // --- Direct staffing by the seat's own lead, and by the Administrator ---
    record(
      (await assignPanelSeat(cid, seatOf(PanelSeatKind.MKT), mktMember.id, mktLead.id)).ok,
      `MKT lead CAN assign an MKT member to the MKT seat`,
    );
    record(
      (await assignPanelSeat(cid, seatOf(PanelSeatKind.TM), tmMember.id, admin.id)).ok,
      `Administrator CAN assign the TM seat (TM's lead IS the Administrator)`,
    );
    // The floating seat is the Club Lead's to fill, with no approval step.
    const floating = await assignPanelSeat(
      cid,
      seatOf(PanelSeatKind.FLOATING),
      clubLead.id,
      clubLead.id,
    );
    record(
      floating.ok && !("awaitingApproval" in floating && floating.awaitingApproval),
      `Club Lead CAN fill the FLOATING seat directly, with NO approval`,
    );
    await resetSeats();

    // --- The Club Lead's request path on another committee's seat ---
    const requested = await assignPanelSeat(
      cid,
      seatOf(PanelSeatKind.MKT),
      clubLead.id,
      clubLead.id,
    );
    record(
      requested.ok && "awaitingApproval" in requested && requested.awaitingApproval === true,
      `Club Lead assigning the MKT seat becomes a PENDING request, not a fill`,
    );
    const open = await prisma.panelSeatApprovalRequest.findFirst({
      where: { seatId: seatOf(PanelSeatKind.MKT), status: ApprovalStatus.PENDING },
      select: { id: true, approverUserId: true },
    });
    record(
      open?.approverUserId === mktLead.id,
      `the request is routed to the CURRENT MKT lead as approver`,
    );
    record(
      (await prisma.panelSeat.findUnique({
        where: { id: seatOf(PanelSeatKind.MKT) },
        select: { claimedById: true },
      }))?.claimedById === null,
      `the requested seat stays EMPTY until it is answered`,
    );

    if (open) {
      record(
        !(await respondToSeatApproval(cid, open.id, true, eerLead.id)).ok,
        `a DIFFERENT committee's lead CANNOT answer the MKT request`,
      );
      record(
        !(await respondToSeatApproval(cid, open.id, true, mktMember.id)).ok,
        `an ordinary member CANNOT answer the MKT request`,
      );
      record(
        (await respondToSeatApproval(cid, open.id, true, mktLead.id)).ok,
        `the MKT lead CAN approve, and the seat fills`,
      );
      record(
        (await prisma.panelSeat.findUnique({
          where: { id: seatOf(PanelSeatKind.MKT) },
          select: { claimedById: true },
        }))?.claimedById === clubLead.id,
        `approval seats the person the request named`,
      );
    }
    await resetSeats();

    // --- Authority moves with the title, live ---
    await prisma.campaignLead.update({
      where: { campaignId_role: { campaignId: cid, role: LeadRole.MKT_LEAD } },
      data: { userId: mktMember.id },
    });
    record(
      !(await assignPanelSeat(cid, seatOf(PanelSeatKind.MKT), mktLead.id, mktLead.id)).ok,
      `the OUTGOING MKT lead loses the seat the moment the title moves`,
    );
    record(
      (await assignPanelSeat(cid, seatOf(PanelSeatKind.MKT), mktLead.id, mktMember.id)).ok,
      `the INCOMING MKT lead has it immediately, with no re-grant`,
    );

    // --- A closed note freezes the panel, for leads and the Administrator ---
    await prisma.interviewNote.upsert({
      where: { applicantId: applicant.id },
      create: { applicantId: applicant.id, closedAt: new Date(), closedById: admin.id },
      update: { closedAt: new Date(), closedById: admin.id },
    });
    record(
      !(await reassignPanelSeat(cid, seatOf(PanelSeatKind.MKT), mktMember.id, mktMember.id)).ok,
      `CLOSED note: the MKT lead CANNOT reassign their own seat`,
    );
    record(
      !(await reassignPanelSeat(cid, seatOf(PanelSeatKind.MKT), mktMember.id, admin.id)).ok,
      `CLOSED note: not even the Administrator can reassign`,
    );
  } finally {
    await prisma.panelSeatApprovalRequest.deleteMany({
      where: { seat: { panelId: panel.id } },
    });
    await prisma.interviewNote.deleteMany({ where: { applicantId: applicant.id } });
    await prisma.panelSeat.deleteMany({ where: { panelId: panel.id } });
    await prisma.interviewPanel.deleteMany({ where: { id: panel.id } });
    await prisma.campaignLead.deleteMany({ where: { campaignId: cid } });
    await prisma.applicant.deleteMany({ where: { id: applicant.id } });
    await prisma.activityLogEntry.deleteMany({ where: { campaignId: cid } });
    await prisma.campaign.deleteMany({ where: { id: cid } });
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
  await auditPanelSeatAuthority(users);

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
