// Database reads and the single write for the Phase 2 page. Everything pure
// (skills tally, entry-type presentation) lives in phase2.ts, which the client
// components import; this module is server-only.

import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/permissions";
import { answerKey, answerQuestions } from "@/lib/phase1-answers";
import {
  readCurrentDiploma,
  readFacebookLink,
  readYearOfStudy,
} from "@/lib/applicant-form-fields";
import { passedPhaseOneWhere } from "@/lib/phase1-ranking";
import { getMktSkillWhitelist } from "@/lib/mkt-skills-store";
import { totalCoefficient } from "@/lib/phase1-score";
import {
  hasAnySkill,
  MKT_TESTS,
  mktSkillsOf,
  type ApplicantSkills,
  type MktTests,
} from "@/lib/phase2";
import {
  canViewAnyPhase2Surface,
  canViewPhase2Surface,
  surfaceOfEntryType,
  type Phase2Viewer,
  type Phase2VisibilityState,
} from "@/lib/phase2-visibility";
import {
  Committee,
  MktTestKind,
  PermissionKey,
  Phase2EntryType,
} from "@/generated/prisma/enums";

/** One configured question's text plus this applicant's answer to it. */
export type Phase2Answer = {
  questionId: string;
  question: string;
  /** The submitted answer, or null when the form row has nothing under its key. */
  answer: string | null;
};

export type Phase2Entry = {
  id: string;
  type: Phase2EntryType;
  authorName: string;
  createdAtISO: string;
  text: string;
};

export type Phase2Applicant = {
  id: string;
  fullName: string;
  preferredCommittee: Committee;
  /** Profile fields from the form, each null when the answer was blank. */
  yearOfStudy: string | null;
  currentDiploma: string | null;
  facebookLink: string | null;
  /**
   * The weighted total as of the last ranking pass, read from PhaseOneResult.
   * Null when a manual override created the row before any recalculation ran —
   * rendered as an em dash, exactly as Phase 1 Selection does. Also null for
   * every row when the viewer may not see scores — see `showScores`.
   */
  score: number | null;
  /**
   * False when some active question has no score yet, so the total is partial.
   * Always true when scores are withheld from this viewer, so the "partial
   * score" caption can't leak anything either.
   */
  complete: boolean;
  /** 1-based position in this page's own descending-score ordering. */
  position: number;
  answers: Phase2Answer[];
  /**
   * Only the entries THIS viewer may read — already filtered server-side by
   * canViewPhase2Surface, per surface and per this applicant's committee. An
   * entry the viewer cannot see is absent from the payload entirely, so it
   * never reaches the browser to be hidden with CSS.
   */
  entries: Phase2Entry[];
  /**
   * Whether the viewer may read each surface FOR THIS APPLICANT. Distinct from
   * `entries` being empty, which only means nothing has been written yet: these
   * drive "—" (not permitted) versus "Nothing recorded" (permitted, empty).
   */
  canViewNotes: boolean;
  canViewFlags: boolean;
  /**
   * Their Other-skills answer, split into whitelisted MKT skills and write-ins.
   * Readable by the whole club.
   */
  mktSkills: ApplicantSkills;
  /**
   * Their marketing-test submissions, readable by the whole club — or null
   * when the applicant listed no whitelisted MKT skill, so isn't expected to
   * take the test. Only editing is restricted (see canEditMktTests).
   */
  mktTests: MktTests | null;
};

/** One applicant behind the skills tally, with the skills that put them there. */
export type MktSkillApplicant = {
  id: string;
  fullName: string;
  /** Their PREFERRED committee — the tally population is not filtered by it. */
  preferredCommittee: Committee;
  /** Their position in the ranked list, so they can be found there. */
  position: number;
  /** Whitelist-matched skills, in the whitelist's own spelling. */
  skills: string[];
  /** "Other:" write-ins, in the applicant's spelling. This or `skills` is non-empty. */
  writeIns: string[];
  /** Same as Phase2Applicant.mktTests, for the tables' Test column. */
  mktTests: MktTests | null;
};

export type Phase2Data = {
  applicants: Phase2Applicant[];
  /** Σ of active coefficients — the denominator scores are shown against. 0 when scores are withheld. */
  maxScore: number;
  /**
   * Whether this viewer may see Phase 1 scores at all. False for MKT and EER
   * committee members (see canViewPhase2Scores); every score, the denominator
   * and the completeness caption are then dropped server-side, so the column
   * is omitted rather than blanked and the figures never reach the browser.
   */
  showScores: boolean;
  /** Raw rows for the skills tally; kept unshaped so phase2.ts can parse them. */
  skillSources: { rawFormData: unknown }[];
  /** This campaign's approved MKT skill names — what separates listed from write-in. */
  mktSkillWhitelist: string[];
  /**
   * The people behind the tally: every applicant with at least one listed skill
   * or write-in, in the same ranked order as the list above. Exactly the population
   * the per-skill counts are computed from, so the detail table and the
   * aggregate table are two views of one set rather than two queries that
   * could drift apart.
   */
  mktSkillApplicants: MktSkillApplicant[];
  /**
   * How many of the applicants above picked MKT as their preferred committee
   * AND listed at least one whitelisted skill.
   *
   * Both halves matter: a plain "chose MKT" count says nothing about whether
   * those people can actually do the work, which is the question this whole
   * section exists to answer. Counted off the same rows the table is built
   * from, using the same matcher the tally uses, so the figure can never
   * disagree with the rows beneath it.
   */
  mktPreferredCount: number;
  /**
   * Whether each surface's COLUMN should be rendered at all for this viewer.
   *
   * False means the column disappears entirely rather than rendering as a
   * strip of blanks — true when the viewer may read the surface for at least
   * one applicant on the page (always, for the Administrator and for a
   * committee-matched Lead; otherwise only while the switch is open).
   */
  showNotesColumn: boolean;
  showFlagsColumn: boolean;
};

/**
 * Everything the Phase 2 page renders, for one campaign.
 *
 * The population is `passedPhaseOneWhere` — AUTO_ACCEPT or MANUAL_ACCEPT — and
 * both the displayed score and the ordering come from the persisted
 * PhaseOneResult.weightedTotal, the same source Phase 1 Selection reads. See
 * the read site below for why this one is cached rather than live.
 *
 * Ties break by name then id, the same tiebreak the ranking pass uses, so the
 * order is stable across loads.
 *
 * VIEWER-DEPENDENT. Notes and flags are filtered here, on the server, against
 * `viewer` and `visibility` (see lib/phase2-visibility.ts) — the ranking,
 * scores, answers and the skills tally are identical for everyone, but the
 * entries a caller gets back are only the ones they are allowed to read. This
 * is deliberately not a UI concern: the entries used to be serialized to every
 * member's browser, so filtering anywhere later would leave the text in the
 * page payload for anyone who opened devtools.
 */
export async function getPhase2Data(
  campaignId: string,
  viewer: Phase2Viewer,
  visibility: Phase2VisibilityState,
  /** From canViewPhase2Scores — whether the Phase 1 scores ride along. */
  includeScores: boolean,
): Promise<Phase2Data> {
  const [questions, applicants, whitelist] = await Promise.all([
    prisma.phaseOneQuestion.findMany({
      where: { campaignId, isActive: true },
      orderBy: { order: "asc" },
      select: {
        id: true,
        text: true,
        coefficient: true,
        sourceField: true,
        requiresTechnicalScorer: true,
      },
    }),
    prisma.applicant.findMany({
      where: passedPhaseOneWhere(campaignId),
      select: {
        id: true,
        fullName: true,
        preferredCommittee: true,
        rawFormData: true,
        phaseOneScores: { select: { questionId: true } },
        phaseOneResult: { select: { weightedTotal: true } },
        phase2Entries: {
          // Oldest first: these read as a running log, and a correction only
          // makes sense underneath the entry it corrects.
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            type: true,
            text: true,
            createdAt: true,
            author: { select: { name: true, email: true } },
          },
        },
        mktTestSubmissions: {
          select: {
            kind: true,
            link: true,
            updatedAt: true,
            submittedBy: { select: { name: true, email: true } },
          },
        },
      },
    }),
    getMktSkillWhitelist(campaignId),
  ]);

  // Only the configured, coefficient-bearing questions get an answer card —
  // the exact filter the Phase 1 answers panel uses. "Other Submitted Answers"
  // (the unmapped rawFormData keys) is deliberately not surfaced here.
  const displayed = answerQuestions(questions);

  const activeIds = new Set(questions.map((q) => q.id));

  const rows = applicants.map((a) => {
    const raw = (a.rawFormData ?? null) as Record<string, unknown> | null;
    // Completeness IS recomputed here — someone may have scored an applicant
    // since the last ranking pass, and the "partial score" caption should stay
    // honest about that. Same split Phase 1 Selection makes: cached score, live
    // completeness. Counting rows is all this needs, so no weighting is
    // involved and the shared formula isn't called.
    const scoredCount = a.phaseOneScores.filter((s) =>
      activeIds.has(s.questionId),
    ).length;

    return {
      id: a.id,
      fullName: a.fullName,
      preferredCommittee: a.preferredCommittee,
      rawFormData: a.rawFormData as unknown,
      yearOfStudy: readYearOfStudy(raw),
      currentDiploma: readCurrentDiploma(raw),
      facebookLink: readFacebookLink(raw),
      // The score as it stood at the last ranking pass, NOT recomputed from the
      // current PhaseOneScore rows and coefficients. This deliberately matches
      // Phase 1 Selection's convention: the number shown is the one the team
      // actually reviewed when they made the decision, and editing a question's
      // coefficient afterwards must not silently rewrite it underneath them.
      // Ranking is an explicit, logged act — the figure moves when someone
      // recalculates, not on its own.
      score: a.phaseOneResult?.weightedTotal ?? null,
      complete: scoredCount === questions.length && questions.length > 0,
      answers: displayed.map((q) => {
        const value = raw?.[answerKey(q)];
        return {
          questionId: q.id,
          question: q.text,
          answer:
            typeof value === "string" && value.trim() !== "" ? value.trim() : null,
        };
      }),
      entries: a.phase2Entries.map((e) => ({
        id: e.id,
        type: e.type,
        // Members are created with a name, but it's nullable in the Auth.js
        // schema — fall back to the email rather than rendering an entry with
        // no attribution at all, which is the one thing this log exists for.
        authorName: e.author.name ?? e.author.email,
        createdAtISO: e.createdAt.toISOString(),
        text: e.text,
      })),
      mktTests: toMktTests(a.mktTestSubmissions),
    };
  });

  // Alphabetical A→Z, the page's one fixed reading order. Score no longer
  // drives the order — the list is a working roster for a discussion, and a
  // known-name lookup shouldn't depend on whoever scores higher. The id
  // tiebreak keeps two same-named people in a stable, deterministic order.
  rows.sort(
    (x, y) =>
      x.fullName.localeCompare(y.fullName) ||
      x.id.localeCompare(y.id),
  );

  const skillNames = whitelist.map((s) => s.skillName);

  // One match pass, reused by both the per-applicant rows and the header count
  // below. Calling mktSkillsOf twice over the same rows would be two chances to
  // apply the whitelist differently; there is only ever one answer per person.
  const matched = rows.map((row) => ({
    row,
    skills: mktSkillsOf(row.rawFormData, skillNames),
  }));

  // Only applicants with a whitelisted MKT skill are expected to take the
  // marketing test — the same bar MktSkillsOutsideMkt uses — so everyone else
  // gets null rather than a misleading "Not submitted".
  const testsFor = (m: (typeof matched)[number]): MktTests | null =>
    m.skills.listed.length > 0 ? m.row.mktTests : null;

  /** This viewer's read access to one applicant's two surfaces. */
  const accessFor = (applicantCommittee: Committee) => ({
    canViewNotes: canViewPhase2Surface({
      viewer,
      surface: "notes",
      applicantCommittee,
      state: visibility,
    }),
    canViewFlags: canViewPhase2Surface({
      viewer,
      surface: "flags",
      applicantCommittee,
      state: visibility,
    }),
  });

  const applicantCommittees = rows.map((r) => r.preferredCommittee);

  return {
    // rawFormData is dropped here rather than passed on: the client card needs
    // only the answers already extracted above, so the rest of the submitted
    // row never leaves the server.
    applicants: rows.map((row, i) => {
      const access = accessFor(row.preferredCommittee);
      return {
        id: row.id,
        fullName: row.fullName,
        preferredCommittee: row.preferredCommittee,
        yearOfStudy: row.yearOfStudy,
        currentDiploma: row.currentDiploma,
        facebookLink: row.facebookLink,
        // Dropped here, AFTER the sort, so the order is the same for everyone —
        // only the figures behind it are withheld.
        score: includeScores ? row.score : null,
        complete: includeScores ? row.complete : true,
        position: i + 1,
        answers: row.answers,
        // THE enforcement point. An entry whose surface this viewer cannot read
        // for this applicant is dropped here, so its text never enters the
        // serialized payload at all.
        entries: row.entries.filter((e) =>
          surfaceOfEntryType(e.type) === "notes"
            ? access.canViewNotes
            : access.canViewFlags,
        ),
        ...access,
        // `matched` is built from `rows` in order, so the index lines up.
        mktSkills: matched[i].skills,
        mktTests: testsFor(matched[i]),
      };
    }),
    maxScore: includeScores ? totalCoefficient(questions) : 0,
    showScores: includeScores,
    // Same population as the ranked list — the skills table counts everyone who
    // passed Phase 1 regardless of preferred committee, so it must not be
    // filtered down to MKT applicants here.
    skillSources: rows.map((r) => ({ rawFormData: r.rawFormData })),
    mktSkillWhitelist: skillNames,
    mktSkillApplicants: matched
      .map((m, i) => ({ ...m, position: i + 1 }))
      .filter((m) => hasAnySkill(m.skills))
      .map((m) => ({
        id: m.row.id,
        fullName: m.row.fullName,
        preferredCommittee: m.row.preferredCommittee,
        position: m.position,
        skills: m.skills.listed,
        writeIns: m.skills.writeIns,
        mktTests: testsFor(m),
      })),
    // The one figure that IS about MKT applicants specifically. Live-counted off
    // the rows above rather than stored, like every other number on this page,
    // and off the same match pass as the detail rows — the header, the detail
    // table and the aggregate table must never be able to disagree about what
    // counts as a match. Whitelisted skills only: a write-in is whatever someone
    // typed, so it can't vouch for "can do MKT work" the way a listed one can.
    mktPreferredCount: matched.filter(
      (m) =>
        m.row.preferredCommittee === Committee.MKT &&
        m.skills.listed.length > 0,
    ).length,
    showNotesColumn: canViewAnyPhase2Surface({
      viewer,
      surface: "notes",
      applicantCommittees,
      state: visibility,
    }),
    showFlagsColumn: canViewAnyPhase2Surface({
      viewer,
      surface: "flags",
      applicantCommittees,
      state: visibility,
    }),
  };
}

/** Submission rows keyed by test, with every missing test as null. */
function toMktTests(
  rows: {
    kind: MktTestKind;
    link: string;
    updatedAt: Date;
    submittedBy: { name: string | null; email: string };
  }[],
): MktTests {
  const tests = Object.fromEntries(
    MKT_TESTS.map((t) => [t.kind, null]),
  ) as MktTests;
  for (const r of rows) {
    tests[r.kind] = {
      link: r.link,
      submittedByName: r.submittedBy.name ?? r.submittedBy.email,
      updatedAtISO: r.updatedAt.toISOString(),
    };
  }
  return tests;
}

/**
 * May this member add, change or remove marketing-test links? MKT committee
 * members only — they run the test. Reading the links is open to the whole
 * club; only writing is restricted. Committee membership rather than a
 * PermissionKey: running the test is what the MKT committee does.
 */
export function canEditMktTests(committee: Committee | null): boolean {
  return committee === Committee.MKT;
}

/**
 * May this user see the MKT Skills Breakdown section?
 *
 * Gated by VIEW_MKT_SKILLS_BREAKDOWN — a real PermissionKey now, not a
 * hardcoded title check. The rest of Phase 2 — the ranked list, the notes and
 * flags — stays open to every authenticated member; this is a section-level
 * restriction, not a page gate, which is why it is a plain boolean here
 * rather than an entry in CAMPAIGN_PAGE_PERMISSIONS.
 *
 * Auto-granted on MKT Lead assignment (source LEAD_ROLE) by
 * AUTO_GRANTED_PERMISSION in lib/campaign-leads.ts — see assignCampaignLead
 * for the grant/revoke rules, including the source:MANUAL protection that
 * keeps a manually-confirmed grant from being auto-revoked on reassignment.
 * The Administrator holds it as an ordinary MANUAL grant on their own
 * UserPermission row (backfilled onto the TM_LEAD template and its current
 * holder when this permission was introduced), the same as every other key
 * they hold.
 *
 * Deliberately NOT campaign-scoped, matching how ENTER_TECHNICAL_SCORE (the
 * other lead-role auto-grant) already behaves: a plain global UserPermission
 * flag, so once granted it reads through on every campaign's Phase 2 page,
 * not only the one where the title was held — no `campaignId` parameter here
 * for exactly that reason, so a caller can't be misled into thinking this is
 * scoped when it structurally isn't.
 */
export async function canViewMktSkills(userId: string): Promise<boolean> {
  return hasPermission(userId, PermissionKey.VIEW_MKT_SKILLS_BREAKDOWN);
}

/** The committee this member belongs to, or null if the user no longer exists. */
export async function getViewerCommittee(
  userId: string,
): Promise<Committee | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { committee: true },
  });
  return user?.committee ?? null;
}

/**
 * Committees whose members don't see Phase 1 scores on Phase 2. They review
 * applicants on the answers, notes and flags alone, so the screening score
 * can't anchor their judgment.
 */
const SCORE_HIDDEN_COMMITTEES: ReadonlySet<Committee> = new Set([
  Committee.MKT,
  Committee.EER,
]);

/**
 * May this viewer see Phase 1 scores on the Phase 2 page? The Administrator
 * always can, whatever their committee; otherwise it's decided by committee
 * membership alone, like canEditMktTests.
 */
export function canViewPhase2Scores(
  viewer: Phase2Viewer,
  committee: Committee | null,
): boolean {
  if (viewer.isAdministrator) return true;
  return committee !== null && !SCORE_HIDDEN_COMMITTEES.has(committee);
}

/**
 * Append one entry. There is deliberately no update or delete counterpart in
 * this module — see the Phase2Entry model comment.
 */
export async function addPhase2Entry(input: {
  applicantId: string;
  type: Phase2EntryType;
  authorId: string;
  text: string;
}): Promise<void> {
  await prisma.phase2Entry.create({ data: input });
}
