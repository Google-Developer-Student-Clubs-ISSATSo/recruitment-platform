// Database reads and the single write for the Phase 2 page. Everything pure
// (skills tally, entry-type presentation) lives in phase2.ts, which the client
// components import; this module is server-only.

import { prisma } from "@/lib/prisma";
import { answerKey, answerQuestions } from "@/lib/phase1-answers";
import { passedPhaseOneWhere } from "@/lib/phase1-ranking";
import { getMktSkillWhitelist } from "@/lib/mkt-skills-store";
import { totalCoefficient } from "@/lib/phase1-score";
import { mktSkillsOf } from "@/lib/phase2";
import { Committee, Phase2EntryType } from "@/generated/prisma/enums";

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
  /**
   * The weighted total as of the last ranking pass, read from PhaseOneResult.
   * Null when a manual override created the row before any recalculation ran —
   * rendered as an em dash, exactly as Phase 1 Selection does.
   */
  score: number | null;
  /** False when some active question has no score yet, so the total is partial. */
  complete: boolean;
  /** 1-based position in this page's own descending-score ordering. */
  position: number;
  answers: Phase2Answer[];
  entries: Phase2Entry[];
};

export type Phase2Data = {
  applicants: Phase2Applicant[];
  /** Σ of active coefficients — the denominator scores are shown against. */
  maxScore: number;
  /** Raw rows for the skills tally; kept unshaped so phase2.ts can parse them. */
  skillSources: { rawFormData: unknown }[];
  /** This campaign's approved MKT skill names — the only values the tally counts. */
  mktSkillWhitelist: string[];
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
 */
export async function getPhase2Data(campaignId: string): Promise<Phase2Data> {
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
    };
  });

  // Nulls sort last, the same `?? -1` treatment Selection's score sort uses:
  // a row with no total yet has nothing to rank on and belongs at the bottom
  // rather than at the top with a 0.
  rows.sort(
    (x, y) =>
      (y.score ?? -1) - (x.score ?? -1) ||
      x.fullName.localeCompare(y.fullName) ||
      x.id.localeCompare(y.id),
  );

  const skillNames = whitelist.map((s) => s.skillName);

  return {
    // rawFormData is dropped here rather than passed on: the client card needs
    // only the answers already extracted above, so the rest of the submitted
    // row never leaves the server.
    applicants: rows.map((row, i) => ({
      id: row.id,
      fullName: row.fullName,
      preferredCommittee: row.preferredCommittee,
      score: row.score,
      complete: row.complete,
      position: i + 1,
      answers: row.answers,
      entries: row.entries,
    })),
    maxScore: totalCoefficient(questions),
    // Same population as the ranked list — the skills table counts everyone who
    // passed Phase 1 regardless of preferred committee, so it must not be
    // filtered down to MKT applicants here.
    skillSources: rows.map((r) => ({ rawFormData: r.rawFormData })),
    mktSkillWhitelist: skillNames,
    // The one figure that IS about MKT applicants specifically. Live-counted off
    // the rows above rather than stored, like every other number on this page,
    // and reusing mktSkillsOf rather than restating the matching rules — the
    // header and the table must never be able to disagree about what counts as
    // a match.
    mktPreferredCount: rows.filter(
      (r) =>
        r.preferredCommittee === Committee.MKT &&
        mktSkillsOf(r.rawFormData, skillNames).length > 0,
    ).length,
  };
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
