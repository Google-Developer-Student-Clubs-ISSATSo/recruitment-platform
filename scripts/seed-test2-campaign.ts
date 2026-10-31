import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  ApplicantStatus,
  Committee,
  MktTestKind,
  PanelSeatKind,
  Phase2EntryType,
  PhaseOneClassification,
} from "../src/generated/prisma/enums";

// One-off dev seed: fill the "test2" campaign with a realistic spread of data —
// extra applicants across every Phase 1 / final-decision state, scores, ranked
// results, interview slots, panels and notes (closed, open and partial), Phase 2
// notes and flags, MKT test links, Phase 1 notes and committee capacity targets.
//
// ADDITIVE and scoped to the one campaign (looked up by name, never by id):
//   - New applicants are tagged by the SEED_DOMAIN email suffix. Re-running
//     deletes exactly those (their scores/notes/entries cascade) and recreates
//     them, so the script is safe to run repeatedly.
//   - Applicants that already existed are only topped up where something is
//     MISSING (a panel, a slot, a note, unclaimed seats, Phase 2 entries) —
//     nothing they already have is edited or removed.
//   - Ranks are recomputed for the whole campaign at the end, the same ordering
//     the Phase 1 ranking pass produces (weighted total desc, name tiebreak).
//
// Run: npx tsx scripts/seed-test2-campaign.ts

const CAMPAIGN_NAME = "test2";
const SEED_DOMAIN = "@t2seed.example.com";
const ACCEPT_THRESHOLD = 40;

const connectionString = process.env.DIRECT_URL;
if (!connectionString) {
  throw new Error("DIRECT_URL is not set — cannot seed.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

// ---------- deterministic randomness ----------

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261101);
const pick = <T,>(xs: readonly T[], i?: number): T =>
  xs[(i ?? Math.floor(rand() * xs.length)) % xs.length];
const quarter = (x: number) => Math.round(x * 4) / 4;
const clamp = (x: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, x));

// ---------- content pools ----------

type Tier = "strong" | "good" | "mid" | "weak";

const ANSWERS = {
  hobbies: {
    solid: [
      "Competitive programming, chess and organising game nights for my class.",
      "Photography, hiking with a student club, and tinkering with Raspberry Pi projects.",
      "Volunteering at a youth association, reading, and amateur video editing.",
      "Football in a university league, podcasting about tech, and board games.",
    ],
    thin: ["Music and movies.", "Sleeping, gaming.", "Football, sometimes reading."],
  },
  why: {
    solid: [
      "GDG is where I can learn from people who actually ship things. I want to get serious about Google Cloud and give back by running workshops for first years.",
      "I attended a DevFest last year and left wanting to be on the organising side. I want to learn event logistics and community building, and bring my design skills.",
      "I want a place to practise teamwork on real projects, and I'd like to learn Flutter and mentor newer members in return.",
    ],
    thin: [
      "I heard it is a good club and it looks good on a CV.",
      "My friends are in it and I want to learn new things.",
    ],
  },
  team: {
    solid: [
      "In our final-year project I split a team of five by strength, set weekly demos, and quietly took over the integration work when a teammate dropped out.",
      "I led the logistics team of a charity event of 200 people. When the venue cancelled two days before, I rebuilt the plan with the team and we moved it on time.",
      "I'm usually the one who writes things down and follows up. On a hackathon team I kept us honest on scope and we shipped a working demo.",
    ],
    thin: [
      "I worked in a group project and we did fine, I did my part.",
      "I prefer working alone but I can work in a team when needed.",
    ],
  },
  standout: {
    solid: [
      "I follow through. If I commit to something, it gets done, even when it stops being fun.",
      "I'm equally comfortable with a laptop and with a microphone — I can build the thing and present it.",
      "I ask uncomfortable questions early, which has saved my teams weeks of rework.",
    ],
    thin: ["I'm motivated and a fast learner.", "I am hardworking and serious."],
  },
  experience: {
    solid: [
      "Treasurer of my high-school scientific club for two years; helped run a robotics day for 80 students.",
      "Volunteer at a local tech meetup, mostly registration and social media.",
      "Member of the ISSATSO sports association media team.",
    ],
    thin: ["No previous experience in clubs.", "Small experience in my neighbourhood association."],
  },
  achievement: {
    solid: [
      "Finished top 10 in a national programming contest after training with a team for three months.",
      "Built and launched a small app used by my faculty to share past exams — about 400 users now.",
      "Organised a fundraiser that collected supplies for a rural school.",
    ],
    thin: ["Passing my baccalaureate.", "Getting into engineering school."],
  },
  crisis: {
    solid: [
      "I'd stop, gather the team, and agree what is still worth saving. Then reduce scope, assign owners and set short checkpoints so nobody is blocked silently.",
      "First figure out whether it's a people problem or a technical one. Fix communication first — the technical part is usually easier once everyone is aligned.",
    ],
    thin: ["I would work harder and ask the team to do the same.", "Try to find a solution together."],
  },
  adjectives: {
    solid: ["Curious, Reliable, Direct", "Creative, Calm, Driven", "Organised, Friendly, Persistent"],
    thin: ["Nice, Funny, Serious", "Hardworking, Kind, Shy"],
  },
  motto: {
    solid: [
      "\"Done is better than perfect\" — it stopped me from polishing things nobody would see.",
      "\"Be the person you needed\" — it pushes me to help newer students.",
    ],
    thin: ["Never give up.", "Life is short."],
  },
} as const;

const INTERVIEW_REMARKS: Record<Tier, string[]> = {
  strong: [
    "Outstanding interview. Came prepared with specific examples and clearly researched what each committee does. Handled the curveball question about a failing project calmly and structured the answer well. Would be a strong asset from day one.\n\nOnly mild concern: could be over-committed — mentioned two other clubs.",
    "Confident without being arrogant. Listened to the other panelists' follow-ups and built on them. Strong problem solving — broke the case study into steps unprompted. Everyone on the panel wants them.",
    "Very articulate, great energy. Real motivation to run workshops and already has ideas for the first semester. Slightly nervous in the first two minutes then took off.",
  ],
  good: [
    "Solid interview. Good communication and clearly motivated, but answers were a bit generic on creativity — needed a nudge to give a concrete example. Teamwork answers were honest and mature.",
    "Pleasant and thoughtful. Strong on teamwork, a little hesitant under pressure when we pushed back on an answer; recovered well. Would fit the committee they applied to.",
    "Good potential. Technical background is decent, communication is clear. Motivation seems genuine though more about learning than contributing — worth coaching.",
    "Calm and organised. Gave a nice example of leading a small team. Lacks event experience but compensates with attitude. Panel is positive but not unanimous on ranking vs. the top group.",
  ],
  mid: [
    "Mixed. Nice person and honest, but struggled with the problem-solving question and gave short answers throughout. Motivation was there once we asked about why GDG. Could grow into the role.",
    "Average interview. Did not seem to have prepared much; knew the club mostly from friends. Good humour, ok teamwork, creativity was limited. Borderline for the committee.",
    "Reserved. Needed lots of prompting. When asked about conflict in a team the answer was vague. Genuinely interested though. Would suggest waitlist.",
  ],
  weak: [
    "Not a fit at this point. Little preparation and difficulty explaining their interest.",
  ],
};

const PHASE1_NOTES = [
  "Strong written answers, especially the team-leader example. Double-check the claimed hackathon placement at the interview.",
  "Technical answers are thin but the motivation answers are very sincere. Worth an interview despite a borderline total.",
  "Copy-pasted-looking answer for 'why GDG' — identical wording to another applicant. Flagging for the interview panel.",
  "Joined through a friend; answers are short across the board. Scored conservatively.",
  "Already volunteers at two local events — probably the most experienced first-year applicant in the pool.",
  "Form says double major but the details are empty; ask at the interview.",
  "Very creative 'what makes you stand out' answer. Scored 1 despite a short text.",
  "Good fit for MKT but listed TM first; may be open to switching committees.",
];

const PHASE2_NOTES = [
  "Spoke to them at the GDG Day booth — very friendly and already knew several current members.",
  "Their Facebook portfolio backs up the design claims on the form; the poster work is genuinely good.",
  "Asked about meeting times: has labs on Tuesday and Thursday afternoons. Otherwise fully available.",
  "Referred by a current member who vouches for their reliability from the high-school club.",
  "Mentioned a second committee interest during the interview. Would be happy in either.",
  "Their GitHub is mostly course projects, but commit history is consistent over two years.",
  "Applied last year as well but missed the Phase 1 cut. Visibly improved since.",
  "Dropped by the club room to ask about the schedule before being invited — proactive.",
  "Needs a laptop for the technical tasks; confirmed they have one now.",
  "Studies in a different school and commutes — attendance on campus days to be confirmed.",
  "Asked thoughtful questions about how decisions are made in the club.",
  "Overlaps with another club's leadership role next semester; said they would step back if accepted.",
  "Correction to the earlier entry: the missed meeting was due to an exam clash that was announced in advance, not a no-show.",
];

const PHASE2_RED = [
  "Arrived 15 minutes late to the interview without notifying anyone.",
  "Spoke dismissively about a past team-mate when asked about conflict.",
  "Claimed leading a project on the form but could not describe their own role in detail.",
  "Missed the MKT test deadline and did not reply to the reminder.",
  "Seemed to be in the interview mostly to pad a CV; low interest in the club's actual activities.",
  "Overcommitted: three other clubs and an internship, attendance is a concern.",
  "Interrupted other panelists repeatedly during the group part.",
  "Phone was constantly on during the interview.",
  "Answers on the form and in person did not match on the dates of their previous experience.",
];

const PHASE2_GREEN = [
  "Took initiative to prepare a short slide deck for the interview unprompted.",
  "Previously organised a 100-person event — rare experience for this pool.",
  "Excellent written communication, the best form answers in the committee.",
  "Offered to help with the next workshop even before being accepted.",
  "Great with people: other applicants in the waiting room gravitated to them.",
  "Delivered the MKT test early and well above the expected level.",
  "Mentors first years at their school; will likely grow into a lead.",
  "Calm under pressure — recovered instantly from a hard follow-up question.",
  "Already uses Google tooling (Firebase, Flutter) in real projects.",
  "Speaks Arabic, French and English fluently — useful for external relations.",
  "Strong referral from a current member and a clean record of follow-through.",
];

// Seat kinds MKT/TM/EER line up with Committee by name; FLOATING has none.
const seatCommittee = (kind: PanelSeatKind): Committee | null =>
  kind === PanelSeatKind.FLOATING ? null : (kind as Committee);

const ROOMS = ["Room A12", "Room B03", "Amphi 2", "Online (Meet)", "Club Room"];

// ---------- applicants to create ----------

type Fate = "ACCEPTED" | "REJECTED_FINAL" | "WAITLIST" | "UNDECIDED";

type Seed = {
  name: string;
  committee: Committee;
  tier: Tier;
  year: string;
  diploma: string;
  skills: string;
  /** Phase 1 outcome: PASSED = AUTO_ACCEPT; the rest as named. */
  p1: "PASSED" | "FAILED" | "TO_DISCUSS" | "INCOMPLETE" | "UNSCORED";
  fate?: Fate;
  /** Interviewed (note written)? Only meaningful for PASSED. */
  interviewed?: boolean;
  /** Leave the note open (draft) rather than closed. */
  openNote?: boolean;
  /** Skip one rating so the note is partial. */
  partial?: boolean;
};

const C = Committee;
const SEEDS: Seed[] = [
  { name: "Yasmine Bouzid", committee: C.MKT, tier: "strong", year: "2", diploma: "Engineering Cycle", skills: "Illustrator, Marketing", p1: "PASSED", fate: "ACCEPTED", interviewed: true },
  { name: "Wassim Jlassi", committee: C.TM, tier: "strong", year: "3", diploma: "Applied License", skills: "Content writing", p1: "PASSED", fate: "ACCEPTED", interviewed: true },
  { name: "Ines Mejri", committee: C.EER, tier: "strong", year: "2", diploma: "Preparatory", skills: "Public speaking", p1: "PASSED", fate: "UNDECIDED", interviewed: true },
  { name: "Anis Belhaj", committee: C.MKT, tier: "good", year: "1", diploma: "Preparatory", skills: "Video/Audio editing, Photography", p1: "PASSED", fate: "UNDECIDED", interviewed: true },
  { name: "Salma Ouertani", committee: C.EER, tier: "good", year: "2", diploma: "Engineering Cycle", skills: "Public speaking, Marketing", p1: "PASSED", fate: "UNDECIDED", interviewed: true },
  { name: "Oussama Dridi", committee: C.TM, tier: "good", year: "3", diploma: "Applied License", skills: "", p1: "PASSED", fate: "WAITLIST", interviewed: true },
  { name: "Eya Karoui", committee: C.MKT, tier: "good", year: "2", diploma: "Engineering Cycle", skills: "Illustrator, Video/Audio editing", p1: "PASSED", fate: "UNDECIDED", interviewed: true, partial: true },
  { name: "Hatem Zouari", committee: C.TM, tier: "mid", year: "1", diploma: "Preparatory", skills: "Photography", p1: "PASSED", fate: "UNDECIDED", interviewed: true },
  { name: "Mariem Sassi", committee: C.EER, tier: "mid", year: "2", diploma: "Applied License", skills: "Content writing", p1: "PASSED", fate: "WAITLIST", interviewed: true },
  { name: "Khalil Bouazizi", committee: C.MKT, tier: "mid", year: "3", diploma: "Engineering Cycle", skills: "Marketing", p1: "PASSED", fate: "REJECTED_FINAL", interviewed: true },
  { name: "Chaima Triki", committee: C.EER, tier: "strong", year: "2", diploma: "Engineering Cycle", skills: "Public speaking, Content writing", p1: "PASSED", fate: "UNDECIDED", interviewed: true, openNote: true },
  { name: "Bilel Haddad", committee: C.TM, tier: "good", year: "1", diploma: "Preparatory", skills: "", p1: "PASSED", fate: "UNDECIDED", interviewed: false },
  { name: "Dorra Lahmar", committee: C.EER, tier: "mid", year: "2", diploma: "Applied License", skills: "Public speaking", p1: "PASSED", fate: "UNDECIDED", interviewed: false },
  { name: "Fares Mabrouk", committee: C.MKT, tier: "weak", year: "1", diploma: "Preparatory", skills: "", p1: "FAILED" },
  { name: "Ghada Nasri", committee: C.TM, tier: "weak", year: "1", diploma: "Preparatory", skills: "", p1: "FAILED" },
  { name: "Hamza Ben Salah", committee: C.EER, tier: "weak", year: "2", diploma: "Applied License", skills: "", p1: "FAILED" },
  { name: "Jihen Rekik", committee: C.MKT, tier: "weak", year: "1", diploma: "Preparatory", skills: "Photography", p1: "FAILED" },
  { name: "Karim Zribi", committee: C.TM, tier: "mid", year: "3", diploma: "Engineering Cycle", skills: "", p1: "TO_DISCUSS" },
  { name: "Lobna Ammar", committee: C.EER, tier: "mid", year: "2", diploma: "Preparatory", skills: "Marketing", p1: "INCOMPLETE" },
  { name: "Marwa Gaaloul", committee: C.MKT, tier: "good", year: "1", diploma: "Preparatory", skills: "Illustrator", p1: "UNSCORED" },
];

const TIER_TOTAL: Record<Tier, [number, number]> = {
  strong: [82, 96],
  good: [64, 80],
  mid: [42, 58],
  weak: [10, 34],
};
const TIER_INTERVIEW_MEAN: Record<Tier, number> = {
  strong: 8.7,
  good: 7.5,
  mid: 6.2,
  weak: 4.5,
};

const NOTE_KEYS = [
  "personality",
  "communication",
  "motivation",
  "creativity",
  "problemSolving",
  "stressManagement",
  "teamWork",
] as const;

function ratings(tier: Tier, partial: boolean) {
  const mean = TIER_INTERVIEW_MEAN[tier];
  const out: Record<string, number | null> = {};
  NOTE_KEYS.forEach((k) => {
    out[k] = clamp(quarter(mean + (rand() - 0.5) * 3), 2, 10);
  });
  if (partial) out.stressManagement = null;
  return out;
}

function formData(
  s: Seed,
  email: string,
  idx: number,
  committeeLabels: Record<string, string>,
) {
  const lvl = s.tier === "strong" || s.tier === "good" ? "solid" : "thin";
  const a = (k: keyof typeof ANSWERS) => pick(ANSWERS[k][lvl], idx + k.length);
  const slug = s.name.toLowerCase().replace(/[^a-z]+/g, ".");
  return {
    Email: email,
    Timestamp: `7/${10 + (idx % 6)}/2026 ${9 + (idx % 10)}:${(idx * 7) % 60 < 10 ? "0" : ""}${(idx * 7) % 60}`,
    "Full name:": s.name,
    "Phone number:": `2${String(1000000 + idx * 73711).slice(0, 7)}`,
    "Birthday date:": `${1 + (idx % 12)}/${1 + ((idx * 3) % 27)}/${2003 + (idx % 3)}`,
    "Year of study:": s.year,
    "Current Diploma:": s.diploma,
    "Your soft skills:": pick(["Communication, Leadership", "Teamwork, Time management", "Creativity, Adaptability"], idx),
    "Github Profile Link:": s.committee === C.TM ? `github.com/${slug}` : "",
    "Terms and Conditions": "I agree",
    "Facebook Profile Link:": `facebook.com/${slug}`,
    "Linkedin Profile Link:": idx % 3 === 0 ? `linkedin.com/in/${slug}` : "",
    "Your technical skills:": pick(["Web Development", "Cloud Engineering", "Mobile Development", "Data / AI", ""], idx),
    "Are you an ISSATSO Student?": "Yes, I am",
    "Do you have any question(s)?": idx % 5 === 0 ? "How often does the club meet during exam periods?" : "",
    "Describe yourself in 3 adjectives:": a("adjectives"),
    "Other skills (designing, editing...)": s.skills,
    "What are your hobbies and interests?": a("hobbies"),
    "What makes you stand out of other candidates ?": a("standout"),
    "What is your life motto. Why you chose it specifically?": a("motto"),
    "Tell us about your most significant achievement that you feel proud of ?": a("achievement"),
    "Which one of our three committees do you think is most suitable for you ?": committeeLabels[s.committee],
    "Why are you interested in joining GDG specifically, and what do you intend to learn?": a("why"),
    "Are you studying a double major ? If yes tell us about it ( in which school and what year )": "",
    "Please list any previous experiences in clubs and/or communities. (Even little experiences matter)": a("experience"),
    "Tell us about an experience where you took the position of a team player or a team leader and how did you manage it ?": a("team"),
    "You and your team have been working on a project for months but at a certain stage everything starts to fall apart and things do not work in the way you wanted, how would you act and what would you do ?": a("crisis"),
  };
}

// ---------- main ----------

async function main() {
  const campaign = await prisma.campaign.findFirst({
    where: { name: CAMPAIGN_NAME },
    select: { id: true, name: true },
  });
  if (!campaign) throw new Error(`Campaign "${CAMPAIGN_NAME}" not found.`);
  const campaignId = campaign.id;
  console.log(`Seeding "${campaign.name}" (${campaignId})`);

  const [users, questions, whitelist] = await Promise.all([
    prisma.user.findMany({
      select: { id: true, name: true, email: true, committee: true, roleTemplate: { select: { name: true } } },
    }),
    prisma.phaseOneQuestion.findMany({
      where: { campaignId, isActive: true },
      orderBy: { order: "asc" },
    }),
    prisma.mktSkillWhitelist.findMany({ where: { campaignId } }),
  ]);
  if (questions.length === 0) throw new Error("test2 has no Phase 1 questions.");

  const tmLead = users.find((u) => u.roleTemplate?.name === "TM_LEAD")!;
  const reviewers = users.filter(
    (u) => u.roleTemplate?.name === "TM_REVIEWER" || u === tmLead,
  );
  const techScorer = users.find((u) => u.roleTemplate?.name === "TECHNICAL_SCORER") ?? tmLead;
  const byCommittee = (c: Committee) => users.filter((u) => u.committee === c);

  // Committee label as the form writes it, copied from existing applicants.
  const existingForLabels = await prisma.applicant.findMany({
    where: { campaignId, NOT: { email: { endsWith: SEED_DOMAIN } } },
    select: { preferredCommittee: true, rawFormData: true },
  });
  const committeeLabels: Record<string, string> = {
    MKT: "Marketing (MKT)",
    TM: "Technical Management (TM)",
    EER: "Events & External Relations (EER)",
  };
  for (const a of existingForLabels) {
    const raw = a.rawFormData as Record<string, unknown> | null;
    const v = raw?.["Which one of our three committees do you think is most suitable for you ?"];
    if (typeof v === "string" && v) committeeLabels[a.preferredCommittee] = v;
  }

  // 1. Remove a previous run's applicants (cascade takes everything attached).
  const removed = await prisma.applicant.deleteMany({
    where: { campaignId, email: { endsWith: SEED_DOMAIN } },
  });
  if (removed.count) console.log(`Removed ${removed.count} applicants from a previous run.`);

  const day = 24 * 3600 * 1000;
  const base = new Date("2026-10-27T09:00:00Z").getTime();

  // 2. Create applicants + Phase 1 scores/results.
  const created: { id: string; seed: Seed; idx: number; total: number | null }[] = [];
  for (const [idx, s] of SEEDS.entries()) {
    const email = `${s.name.toLowerCase().replace(/[^a-z]+/g, ".")}${SEED_DOMAIN}`;
    const status: ApplicantStatus =
      s.p1 === "FAILED"
        ? ApplicantStatus.REJECTED_PHASE1
        : s.p1 === "PASSED"
          ? s.fate === "ACCEPTED"
            ? ApplicantStatus.ACCEPTED
            : s.fate === "REJECTED_FINAL"
              ? ApplicantStatus.REJECTED_FINAL
              : s.fate === "WAITLIST"
                ? ApplicantStatus.PENDING
                : ApplicantStatus.SHORTLISTED
          : ApplicantStatus.SUBMITTED;

    const applicant = await prisma.applicant.create({
      data: {
        campaignId,
        fullName: s.name,
        email,
        isIssatsoStudent: true,
        preferredCommittee: s.committee,
        assignedCommittee: s.fate === "ACCEPTED" ? s.committee : null,
        status,
        rawFormData: formData(s, email, idx, committeeLabels),
        createdAt: new Date(base - 5 * day + idx * 3600 * 1000),
      },
    });

    let total: number | null = null;
    if (s.p1 !== "UNSCORED") {
      const [lo, hi] = TIER_TOTAL[s.tier];
      const maxTotal = questions.reduce((sum, q) => sum + q.coefficient, 0);
      // Draw per-question scores on the 0 / 0.5 / 1 scale until the weighted
      // total lands in the tier's band, so the stored total always equals what
      // the scores add up to (the app recomputes it from them).
      let values: number[] = [];
      for (let attempt = 0; attempt < 500; attempt++) {
        const p = (lo + rand() * (hi - lo)) / 100;
        values = questions.map(() => {
          const r = rand();
          return r < p - 0.25 ? 1 : r < p + 0.25 ? 0.5 : 0;
        });
        const sum = values.reduce((t, v, qi) => t + v * questions[qi].coefficient, 0);
        const pct = (sum / maxTotal) * 100;
        if (pct >= lo && pct <= hi) break;
      }
      const scoredQuestions = s.p1 === "INCOMPLETE" ? questions.slice(0, 6) : questions;
      const rows = scoredQuestions.map((q, qi) => ({
        applicantId: applicant.id,
        questionId: q.id,
        value: values[qi],
        scoredById: q.requiresTechnicalScorer ? techScorer.id : pick(reviewers, qi + idx).id,
        scoredAt: new Date(base - 3 * day + idx * 1800 * 1000 + qi * 60000),
      }));
      await prisma.phaseOneScore.createMany({ data: rows });
      total = rows.reduce(
        (sum, r, qi) => sum + r.value * scoredQuestions[qi].coefficient,
        0,
      );
      let classification: PhaseOneClassification = PhaseOneClassification.PENDING;
      if (s.p1 === "PASSED") classification = PhaseOneClassification.AUTO_ACCEPT;
      else if (s.p1 === "FAILED") classification = PhaseOneClassification.AUTO_REJECT;
      else if (s.p1 === "TO_DISCUSS") classification = PhaseOneClassification.TO_DISCUSS;
      if (s.p1 === "PASSED" && total < ACCEPT_THRESHOLD) {
        throw new Error(`${s.name}: PASSED applicant scored ${total}, below ${ACCEPT_THRESHOLD}.`);
      }
      await prisma.phaseOneResult.create({
        data: {
          applicantId: applicant.id,
          weightedTotal: total,
          classification,
        },
      });
    }

    if (idx % 2 === 0 && s.p1 !== "UNSCORED") {
      await prisma.phaseOneNote.create({
        data: {
          applicantId: applicant.id,
          text: pick(PHASE1_NOTES, idx),
          authorId: pick(reviewers, idx).id,
        },
      });
    }
    created.push({ id: applicant.id, seed: s, idx, total });
  }
  console.log(`Created ${created.length} applicants with Phase 1 scores.`);

  // 3. The interview / Phase 2 population: every applicant who passed Phase 1,
  //    new or pre-existing.
  const passed = await prisma.applicant.findMany({
    where: {
      campaignId,
      phaseOneResult: { is: { classification: { in: ["AUTO_ACCEPT", "MANUAL_ACCEPT"] } } },
    },
    include: {
      interviewPanel: { include: { seats: true } },
      interviewSlot: true,
      interviewNote: { select: { id: true } },
      phase2Entries: { select: { id: true } },
      mktTestSubmissions: { select: { kind: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const seedById = new Map(created.map((c) => [c.id, c.seed] as const));
  let slotN = 0;
  let panels = 0;
  let notes = 0;
  let entries = 0;
  let tests = 0;
  const seatKinds = [PanelSeatKind.MKT, PanelSeatKind.TM, PanelSeatKind.EER];

  for (const [i, a] of passed.entries()) {
    const s = seedById.get(a.id);
    const tier: Tier = s?.tier ?? pick(["good", "good", "mid", "strong"] as const, i);
    // Existing applicants (no seed entry) count as interviewed, so their
    // dossier has a note; new ones follow their spec.
    const interviewed = s ? s.interviewed !== false : true;
    const slotTime = new Date(base + (slotN % 6) * day + (slotN % 5) * 25 * 60000);
    const upcoming = !interviewed;
    const when = upcoming ? new Date(base + 7 * day + slotN * 20 * 60000) : slotTime;
    slotN++;

    // Slot
    if (!a.interviewSlot) {
      await prisma.interviewSlot.create({
        data: {
          applicantId: a.id,
          scheduledTime: when,
          room: pick(ROOMS, i),
          enteredById: pick(reviewers, i).id,
          enteredAt: new Date(base - day),
        },
      });
    }

    // Panel: committee seats claimed by a member of that committee. Upcoming
    // interviews keep one seat open so the board shows an unfilled jury.
    let panel = a.interviewPanel;
    if (!panel) {
      const made = await prisma.interviewPanel.create({
        data: {
          applicantId: a.id,
          seats: {
            create: seatKinds.map((kind, ki) => {
              const open = upcoming && ki === 2;
              const member = pick(byCommittee(seatCommittee(kind)!), i + ki);
              return {
                kind,
                claimedById: open ? null : member.id,
                claimedAt: open ? null : new Date(base - day + ki * 600000),
              };
            }),
          },
        },
        include: { seats: true },
      });
      panel = made;
      panels++;
    } else if (interviewed) {
      for (const seat of panel.seats) {
        if (seat.claimedById) continue;
        const committee = seatCommittee(seat.kind);
        const member = pick(committee ? byCommittee(committee) : users, i);
        await prisma.panelSeat.update({
          where: { id: seat.id },
          data: { claimedById: member.id, claimedAt: new Date(base - day) },
        });
      }
    }

    // Interview note
    if (interviewed && !a.interviewNote) {
      const remarksPool = INTERVIEW_REMARKS[tier];
      const closed = !s?.openNote;
      await prisma.interviewNote.create({
        data: {
          applicantId: a.id,
          ...ratings(tier, s?.partial ?? false),
          remarks: i % 7 === 6 ? null : pick(remarksPool, i),
          closedAt: closed ? new Date(when.getTime() + 3600 * 1000 * (2 + (i % 5))) : null,
          closedById: closed ? pick([tmLead, ...reviewers], i).id : null,
        },
      });
      notes++;
    }

    // Phase 2 entries — only top up applicants that have none yet.
    if (a.phase2Entries.length === 0) {
      const rows: {
        applicantId: string;
        type: Phase2EntryType;
        authorId: string;
        text: string;
        createdAt: Date;
      }[] = [];
      const at = (n: number) =>
        new Date(base - 2 * day + i * 5400000 + n * 2700000);
      const nNotes = 1 + (i % 3);
      const nGreen = tier === "strong" ? 2 + (i % 2) : tier === "good" ? 1 + (i % 2) : i % 2;
      const nRed = tier === "mid" ? 1 + (i % 2) : tier === "good" ? i % 2 : i % 4 === 0 ? 1 : 0;
      for (let n = 0; n < nNotes; n++)
        rows.push({ applicantId: a.id, type: Phase2EntryType.NOTE, authorId: pick(users, i + n * 3).id, text: pick(PHASE2_NOTES, i * 2 + n), createdAt: at(n) });
      for (let n = 0; n < nGreen; n++)
        rows.push({ applicantId: a.id, type: Phase2EntryType.GREEN_FLAG, authorId: pick(users, i + n * 5 + 1).id, text: pick(PHASE2_GREEN, i * 2 + n), createdAt: at(nNotes + n) });
      for (let n = 0; n < nRed; n++)
        rows.push({ applicantId: a.id, type: Phase2EntryType.RED_FLAG, authorId: pick(users, i + n * 7 + 2).id, text: pick(PHASE2_RED, i * 2 + n), createdAt: at(nNotes + nGreen + n) });
      await prisma.phase2Entry.createMany({ data: rows });
      entries += rows.length;
    }

    // MKT tests for applicants who listed a whitelisted MKT skill.
    const raw = a.rawFormData as Record<string, unknown> | null;
    const skillKey = Object.keys(raw ?? {}).find((k) => k.toLowerCase().startsWith("other skills"));
    const skillText = String(raw?.[skillKey ?? ""] ?? "").toLowerCase();
    const listed = whitelist.some((w) => skillText.includes(w.skillName.toLowerCase()));
    if (listed) {
      const existingKinds = new Set(a.mktTestSubmissions.map((t) => t.kind));
      const want: MktTestKind[] = [];
      if (/illustrator|design/.test(skillText)) want.push(MktTestKind.GRAPHIC_DESIGN);
      if (/video|audio/.test(skillText)) want.push(MktTestKind.VIDEO_EDITING);
      if (want.length === 0 && i % 2 === 0) want.push(MktTestKind.GRAPHIC_DESIGN);
      for (const kind of want) {
        if (existingKinds.has(kind) || i % 4 === 3) continue; // leave a few as "not submitted"
        await prisma.mktTestSubmission.create({
          data: {
            applicantId: a.id,
            kind,
            link: `https://drive.google.com/drive/folders/t2seed-${a.id.slice(-6)}-${kind.toLowerCase()}`,
            submittedById: pick(byCommittee(C.MKT), i).id,
          },
        });
        tests++;
      }
    }
  }
  console.log(
    `Passed-Phase-1 pool: ${passed.length} applicants → +${panels} panels, +${notes} interview notes, +${entries} Phase 2 entries, +${tests} MKT test links.`,
  );

  // 4. Re-rank the whole campaign (complete applicants only), exactly as the
  //    ranking pass orders them.
  const results = await prisma.phaseOneResult.findMany({
    where: { applicant: { campaignId }, weightedTotal: { not: null }, classification: { not: "PENDING" } },
    select: { id: true, weightedTotal: true, applicant: { select: { fullName: true, id: true } } },
  });
  results.sort(
    (a, b) =>
      (b.weightedTotal ?? 0) - (a.weightedTotal ?? 0) ||
      a.applicant.fullName.localeCompare(b.applicant.fullName) ||
      a.applicant.id.localeCompare(b.applicant.id),
  );
  for (const [i, r] of results.entries()) {
    await prisma.phaseOneResult.update({ where: { id: r.id }, data: { rank: i + 1 } });
  }
  console.log(`Ranked ${results.length} applicants.`);

  // 5. Committee capacity targets, only where none exist.
  const targets: Record<Committee, number> = { MKT: 4, TM: 4, EER: 3 };
  for (const [committee, target] of Object.entries(targets) as [Committee, number][]) {
    await prisma.committeeCapacity.upsert({
      where: { campaignId_committee: { campaignId, committee } },
      create: { campaignId, committee, target },
      update: {},
    });
  }
  console.log("Committee capacity targets ensured (MKT 4, TM 4, EER 3).");

  const total = await prisma.applicant.count({ where: { campaignId } });
  console.log(`Done. "${CAMPAIGN_NAME}" now has ${total} applicants.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
