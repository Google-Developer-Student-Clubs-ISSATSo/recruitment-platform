import { committeeLabel } from "@/lib/committee";
import { buildJury, seatKindLabel } from "@/lib/panel-seat-kind";
import {
  computeAverage,
  formatAverage,
  NOTE_FIELDS,
  type NoteScores,
} from "@/lib/interview-note";
import { formatTunisDateTime } from "@/lib/tunis-time";
import { ApplicantStatus } from "@/generated/prisma/enums";

// Pure Markdown rendering for the pre-meeting interview dossiers. Imports
// NOTHING from the database layer — the export script does the querying, this
// module only turns rows into text, so a future in-app export route can reuse
// exactly the same wording instead of forking it.
//
// The dossier deliberately mirrors what the final-decision dashboard shows: the
// jury in fixed seat order, the seven ratings plus their live-computed average,
// the panel's remarks, and whether the note is still open.
//
// Phase 1 scores are deliberately NOT part of this output: MKT and EER members
// are not allowed to see them (canViewPhase2Scores), and this packet is meant to
// be read by the whole core team.

/** The rows the dossier is built from — mirrors the dashboard's select. */
export type DossierApplicant = {
  id: string;
  fullName: string;
  email: string;
  status: ApplicantStatus;
  preferredCommittee: Parameters<typeof committeeLabel>[0];
  assignedCommittee: Parameters<typeof committeeLabel>[0] | null;
  interviewSlot: { scheduledTime: Date | null; room: string | null } | null;
  interviewPanel: {
    seats: {
      kind: Parameters<typeof seatKindLabel>[0];
      claimedBy: { name: string | null; email: string } | null;
    }[];
  } | null;
  interviewNote: (NoteScores & {
    remarks: string | null;
    closedAt: Date | null;
    closedBy: { name: string | null; email: string } | null;
  }) | null;
};

/** One rendered section plus the figures the roster table needs. */
export type Dossier = {
  markdown: string;
  average: number | null;
  juryFilled: number;
  juryTotal: number;
};

/** Filename-safe, accent-stripped version of a name. */
export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** One table cell: no pipes, no line breaks, no stray tabs. */
export function cell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
}

/** Multi-line free text as a blockquote, so Markdown can't swallow it. */
function quote(value: string): string {
  return value
    .split(/\r?\n/)
    .map((line) => `> ${line}`.trimEnd())
    .join("\n");
}

export function statusLabel(status: ApplicantStatus): string {
  switch (status) {
    case ApplicantStatus.ACCEPTED:
      return "Accepted";
    case ApplicantStatus.REJECTED_FINAL:
      return "Rejected";
    case ApplicantStatus.PENDING:
      return "Waitlisted (undecided)";
    default:
      return "Undecided";
  }
}

/**
 * Render one applicant's section. `headingLevel` is 1 for a stand-alone file and
 * 2 when the section sits under a combined document's title.
 */
export function renderDossier(
  a: DossierApplicant,
  campaignName: string,
  headingLevel: 1 | 2 = 1,
): Dossier {
  const note = a.interviewNote;
  const jury = buildJury(a.interviewPanel?.seats ?? []);
  const scores = NOTE_FIELDS.map((f) => ({
    label: f.label,
    value: note?.[f.key] ?? null,
  }));
  const scoreMap: NoteScores = {};
  for (const f of NOTE_FIELDS) scoreMap[f.key] = note?.[f.key] ?? null;
  const average = note ? computeAverage(scoreMap) : null;

  const lines: string[] = [
    `${"#".repeat(headingLevel)} ${a.fullName}`,
    "",
    `- **Campaign:** ${campaignName}`,
    `- **Status:** ${statusLabel(a.status)}`,
    `- **Preferred committee:** ${committeeLabel(a.preferredCommittee)}`,
    `- **Assigned committee:** ${
      a.assignedCommittee ? committeeLabel(a.assignedCommittee) : "—"
    }`,
    `- **Email:** ${a.email}`,
    `- **Interview:** ${
      a.interviewSlot?.scheduledTime
        ? `${formatTunisDateTime(a.interviewSlot.scheduledTime)}${
            a.interviewSlot.room ? ` · Room ${a.interviewSlot.room}` : ""
          }`
        : "not booked"
    }`,
    "",
    "### Jury",
    "",
  ];

  if (jury.length === 0) {
    lines.push("_No panel seats recorded._");
  } else {
    lines.push("| Seat | Panellist |", "| --- | --- |");
    for (const seat of jury) {
      lines.push(
        `| ${seatKindLabel(seat.kind)} | ${cell(seat.name ?? "— unfilled")} |`,
      );
    }
  }

  lines.push("", "### Interview scoring", "");
  if (!note || scores.every((s) => s.value == null)) {
    lines.push("_No interview scores recorded yet._");
  } else {
    lines.push("| Dimension | Score |", "| --- | --- |");
    for (const s of scores) {
      lines.push(`| ${s.label} | ${s.value == null ? "—" : s.value} |`);
    }
    lines.push(`| **Average** | **${formatAverage(average)}** |`);
  }

  lines.push("", "### Remarks", "");
  lines.push(note?.remarks?.trim() ? quote(note.remarks.trim()) : "_None._");

  lines.push("");
  if (!note) {
    lines.push("_Interview note not started._");
  } else if (note.closedAt) {
    const who = note.closedBy?.name ?? note.closedBy?.email ?? "unknown";
    lines.push(
      `_Note closed ${formatTunisDateTime(note.closedAt)} by ${who}._`,
    );
  } else {
    lines.push("_Note still open — scores may still change._");
  }

  return {
    markdown: lines.join("\n"),
    average,
    juryFilled: jury.filter((s) => s.name).length,
    juryTotal: jury.length,
  };
}
