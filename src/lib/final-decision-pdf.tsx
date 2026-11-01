import {
  Document,
  Font,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";

import { ApplicantStatus, Phase2EntryType } from "@/generated/prisma/enums";
import { committeeLabel } from "@/lib/committee";
import { compareByInterview, interviewAverage, type DecisionRow } from "@/lib/final-decision";
import { formatAverage, NOTE_FIELDS, RATING_MAX } from "@/lib/interview-note";
import { seatKindLabel } from "@/lib/panel-seat-kind";
import { PHASE2_SECTIONS } from "@/lib/phase2";
import { formatTunisDateTime } from "@/lib/tunis-time";

// The interview-reviews PDF: one cover page, then one page per applicant —
// details and jury, the seven ratings with their average, the panel's remarks,
// and the Phase 2 notes / red flags / green flags — ordered by interview
// average, best first.
//
// This renders to a PDF, not to the app's UI, so the design tokens in
// globals.css (CSS custom properties) don't exist here: a PDF needs literal
// colours. They are the club's Google palette, kept in ONE place below so the
// document can't drift from itself.
//
// Phase 1 scores are deliberately absent, like everywhere on the Final Decision
// page: this packet is read by the whole core team, and MKT / EER members are
// not allowed to see them.
//
// Text is set in the built-in Helvetica, which covers Latin-1 plus common
// punctuation. Anything else (emoji, Arabic script) can't be drawn by that font,
// so pdfSafe() swaps it for "?" rather than letting it render as an invisible
// gap — a visible "?" at least says something was there.

// Never hyphenate: "In-terview" in a heading or "com-mittee" in a remark reads
// as a typo, and names must never be split.
Font.registerHyphenationCallback((word) => [word]);

const COLOR = {
  blue: "#1a73e8",
  red: "#ea4335",
  yellow: "#fbbc04",
  green: "#34a853",
  ink: "#202124",
  muted: "#5f6368",
  rule: "#dadce0",
  track: "#e8eaed",
  blueTint: "#e8f0fe",
  redText: "#c5221f",
  redTint: "#fce8e6",
  greenText: "#137333",
  greenTint: "#e6f4ea",
} as const;

const SECTION_TONE = {
  neutral: { heading: COLOR.muted, border: COLOR.rule, bg: "#f8f9fa" },
  rejected: { heading: COLOR.redText, border: COLOR.red, bg: COLOR.redTint },
  accepted: { heading: COLOR.greenText, border: COLOR.green, bg: COLOR.greenTint },
} as const;

const DECISION_LABEL: Record<ApplicantStatus, string> = {
  [ApplicantStatus.ACCEPTED]: "Accepted",
  [ApplicantStatus.REJECTED_FINAL]: "Rejected",
  [ApplicantStatus.PENDING]: "Shortlisted",
  [ApplicantStatus.SHORTLISTED]: "Not decided",
  [ApplicantStatus.SUBMITTED]: "Not decided",
  [ApplicantStatus.REJECTED_PHASE1]: "Not decided",
  [ApplicantStatus.INVITED_GDG_DAY]: "Not decided",
  [ApplicantStatus.INTERVIEW_SCHEDULED]: "Not decided",
};

// Latin-1 plus the WinAnsi extras Helvetica also carries.
const WIN_ANSI_EXTRAS = new Set("–—‘’‚“”„•…€™".split(""));

/** Replace anything the built-in font can't draw with "?". */
export function pdfSafe(value: string): string {
  let out = "";
  for (const ch of value.replace(/\t/g, " ").replace(/\r\n?/g, "\n")) {
    const code = ch.codePointAt(0) ?? 0;
    const ok =
      ch === "\n" ||
      (code >= 0x20 && code <= 0x7e) ||
      (code >= 0xa0 && code <= 0xff) ||
      WIN_ANSI_EXTRAS.has(ch);
    out += ok ? ch : "?";
  }
  return out;
}

/** "A12" → "Room A12", but leave "Room A12" and "Online (Meet)" as typed. */
function roomLabel(room: string): string {
  return /^(room|salle|amphi|online)/i.test(room.trim()) ? room.trim() : `Room ${room.trim()}`;
}

/** Trim a rating to what it needs: 6 → "6", 6.5 → "6.5", 7.25 → "7.25". */
function formatRating(value: number): string {
  return String(Number(value.toFixed(2)));
}

const styles = StyleSheet.create({
  page: {
    paddingTop: 44,
    paddingHorizontal: 44,
    paddingBottom: 64,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: COLOR.ink,
    lineHeight: 1.35,
  },
  footer: {
    position: "absolute",
    left: 44,
    right: 44,
    bottom: 28,
    borderTopWidth: 0.5,
    borderTopColor: COLOR.rule,
    paddingTop: 8,
    fontSize: 8,
    color: COLOR.muted,
  },

  // cover
  brandBar: { flexDirection: "row", width: 180, height: 5, marginBottom: 40 },
  brand: { fontSize: 18, fontFamily: "Helvetica-Bold", marginBottom: 20 },
  title: {
    fontSize: 38,
    lineHeight: 1.1,
    fontFamily: "Helvetica-Bold",
    color: COLOR.blue,
  },
  subtitle: { fontSize: 15, color: COLOR.muted, marginTop: 36 },
  metaRow: { flexDirection: "row", gap: 36, marginTop: 40 },
  metaLabel: {
    fontSize: 8,
    letterSpacing: 1,
    fontFamily: "Helvetica-Bold",
    color: COLOR.muted,
    textTransform: "uppercase",
  },
  metaValue: { fontSize: 12, marginTop: 3 },
  coverNote: { fontSize: 11, marginTop: 44 },
  internal: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: COLOR.redText,
    marginTop: 12,
  },

  // applicant
  eyebrow: {
    fontSize: 8.5,
    letterSpacing: 1,
    color: COLOR.muted,
    textTransform: "uppercase",
  },
  name: { fontSize: 26, fontFamily: "Helvetica-Bold", marginTop: 4 },
  rule: {
    borderBottomWidth: 1.2,
    borderBottomColor: COLOR.blue,
    marginTop: 14,
    marginBottom: 16,
  },
  columns: { flexDirection: "row", gap: 22 },
  heading: {
    fontSize: 8.5,
    letterSpacing: 1,
    fontFamily: "Helvetica-Bold",
    color: COLOR.blue,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  fieldLabel: { fontSize: 8, color: COLOR.muted },
  fieldValue: { fontSize: 10, marginTop: 1 },
  field: {
    paddingBottom: 6,
    marginBottom: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: COLOR.rule,
  },
  juryHead: {
    flexDirection: "row",
    fontSize: 7.5,
    letterSpacing: 0.8,
    color: COLOR.muted,
    textTransform: "uppercase",
    paddingBottom: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: COLOR.rule,
  },
  juryRow: {
    flexDirection: "row",
    paddingVertical: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: COLOR.rule,
  },
  jurySeat: { width: 44, fontFamily: "Helvetica-Bold", color: COLOR.blue },
  avgRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  // Separate Text boxes with an explicit line-height: a large run nested in a
  // 10pt parent gets a 10pt line box and overprints the row below it.
  avgFigure: { flexDirection: "row", alignItems: "flex-end", gap: 3 },
  avgValue: {
    fontSize: 30,
    lineHeight: 1,
    fontFamily: "Helvetica-Bold",
    color: COLOR.blue,
  },
  avgOutOf: { fontSize: 11, lineHeight: 1, color: COLOR.muted, marginBottom: 3 },
  avgLabel: {
    fontSize: 8,
    letterSpacing: 1,
    color: COLOR.muted,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  ratingTop: { flexDirection: "row", justifyContent: "space-between" },
  ratingValue: { fontFamily: "Helvetica-Bold" },
  barTrack: {
    height: 3.5,
    borderRadius: 2,
    backgroundColor: COLOR.track,
    marginTop: 3,
    marginBottom: 7,
  },
  barFill: { height: 3.5, borderRadius: 2, backgroundColor: COLOR.blue },
  remarks: {
    backgroundColor: COLOR.blueTint,
    borderLeftWidth: 3,
    borderLeftColor: COLOR.blue,
    padding: 10,
    fontSize: 10,
    lineHeight: 1.45,
  },
  muted: { color: COLOR.muted },
  italicMuted: { color: COLOR.muted, fontFamily: "Helvetica-Oblique" },
  closedLine: {
    marginTop: 8,
    fontSize: 7.5,
    letterSpacing: 0.8,
    color: COLOR.muted,
    textTransform: "uppercase",
  },

  // phase 2
  phase2: { marginTop: 22 },
  entryHeading: {
    fontSize: 8.5,
    letterSpacing: 1,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    marginBottom: 6,
  },
  entry: {
    borderLeftWidth: 2.5,
    paddingVertical: 5,
    paddingHorizontal: 8,
    marginBottom: 6,
  },
  entryText: { fontSize: 9, lineHeight: 1.4 },
  entryMeta: { fontSize: 7.5, color: COLOR.muted, marginTop: 3 },
});

type Props = {
  campaignName: string;
  generatedAt: Date;
  rows: DecisionRow[];
};

function Footer({ campaignName }: { campaignName: string }) {
  return (
    <Text
      fixed
      style={styles.footer}
      render={({ pageNumber, totalPages }) =>
        pdfSafe(
          `GDGC ISSATSo · Interview Reviews · ${campaignName} · page ${pageNumber} of ${totalPages}`,
        )
      }
    />
  );
}

function Cover({ campaignName, generatedAt, rows }: Props) {
  return (
    <Page size="A4" style={styles.page}>
      <View style={styles.brandBar}>
        {[COLOR.blue, COLOR.red, COLOR.yellow, COLOR.green].map((c) => (
          <View key={c} style={{ flex: 1, backgroundColor: c }} />
        ))}
      </View>
      <Text style={styles.brand}>
        <Text style={{ color: COLOR.blue }}>G</Text>
        <Text style={{ color: COLOR.red }}>D</Text>
        <Text style={{ color: COLOR.yellow }}>G</Text>
        <Text style={{ color: COLOR.green }}>C</Text>
        {" ISSATSo"}
      </Text>
      <Text style={styles.title}>Core Team Recruitment Interview Review</Text>
      <Text style={styles.subtitle}>
        Candidate scorecards for the decision meeting
      </Text>
      <View style={styles.metaRow}>
        <View>
          <Text style={styles.metaLabel}>Campaign</Text>
          <Text style={styles.metaValue}>{pdfSafe(campaignName)}</Text>
        </View>
        <View>
          <Text style={styles.metaLabel}>Generated</Text>
          <Text style={styles.metaValue}>{formatTunisDateTime(generatedAt)}</Text>
        </View>
        <View>
          <Text style={styles.metaLabel}>Applicants</Text>
          <Text style={styles.metaValue}>{rows.length}</Text>
        </View>
      </View>
      <Text style={styles.coverNote}>
        Applicants are ordered by interview score, best first. Applicants who
        have not been interviewed come last.
      </Text>
      <Text style={styles.internal}>
        Internal — contains applicant data. Do not distribute.
      </Text>
      <Footer campaignName={campaignName} />
    </Page>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.field} wrap={false}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{pdfSafe(value)}</Text>
    </View>
  );
}

function ApplicantPage({
  row,
  index,
  total,
  campaignName,
}: {
  row: DecisionRow;
  index: number;
  total: number;
  campaignName: string;
}) {
  const average = interviewAverage(row);
  const hasScores =
    row.noteScores !== null &&
    NOTE_FIELDS.some((f) => typeof row.noteScores?.[f.key] === "number");

  const interview = row.interviewAtISO
    ? `${formatTunisDateTime(new Date(row.interviewAtISO))}${
        row.interviewRoom ? ` · ${roomLabel(row.interviewRoom)}` : ""
      }`
    : "Not booked";

  let noteState: string;
  if (row.noteScores === null && !row.remarks) {
    noteState = "Interview note not started";
  } else if (row.noteClosed) {
    noteState = `Closed${
      row.closedAtISO ? ` · ${formatTunisDateTime(new Date(row.closedAtISO))}` : ""
    }${row.closedByName ? ` · ${row.closedByName}` : ""}`;
  } else {
    noteState = "Note still open — scores may still change";
  }

  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.eyebrow}>
        Applicant {index + 1} of {total}
      </Text>
      <Text style={styles.name}>{pdfSafe(row.fullName)}</Text>
      <View style={styles.rule} />

      <View style={styles.columns}>
        {/* Details + jury */}
        <View style={{ flex: 1 }}>
          <Text style={styles.heading}>Details</Text>
          <Field
            label="Preferred committee"
            value={committeeLabel(row.preferredCommittee)}
          />
          {row.assignedCommittee && (
            <Field
              label="Assigned committee"
              value={committeeLabel(row.assignedCommittee)}
            />
          )}
          <Field label="Decision" value={DECISION_LABEL[row.status]} />
          <Field label="Interview" value={interview} />

          <Text style={[styles.heading, { marginTop: 10 }]}>Jury</Text>
          {row.jury.length === 0 ? (
            <Text style={styles.italicMuted}>No panel seats recorded.</Text>
          ) : (
            <View>
              <View style={styles.juryHead}>
                <Text style={{ width: 44 }}>Seat</Text>
                <Text>Panellist</Text>
              </View>
              {row.jury.map((j) => (
                <View key={j.kind} style={styles.juryRow} wrap={false}>
                  <Text style={styles.jurySeat}>{seatKindLabel(j.kind)}</Text>
                  <Text style={j.name ? undefined : styles.italicMuted}>
                    {j.name ? pdfSafe(j.name) : "Open"}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Ratings */}
        <View style={{ flex: 1.1 }}>
          <Text style={styles.heading}>Interview scores</Text>
          {hasScores ? (
            <View>
              <View style={styles.avgRow}>
                <View style={styles.avgFigure}>
                  <Text style={styles.avgValue}>{formatAverage(average)}</Text>
                  <Text style={styles.avgOutOf}>/{RATING_MAX}</Text>
                </View>
                <Text style={styles.avgLabel}>Average</Text>
              </View>
              {NOTE_FIELDS.map((f) => {
                const v = row.noteScores?.[f.key];
                const has = typeof v === "number";
                return (
                  <View key={f.key} wrap={false}>
                    <View style={styles.ratingTop}>
                      <Text>{f.label}</Text>
                      <Text style={styles.ratingValue}>
                        {has ? formatRating(v) : "—"}
                      </Text>
                    </View>
                    <View style={styles.barTrack}>
                      {has && (
                        <View
                          style={[
                            styles.barFill,
                            { width: `${Math.min(100, (v / RATING_MAX) * 100)}%` },
                          ]}
                        />
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            <Text style={styles.italicMuted}>Not interviewed yet.</Text>
          )}
        </View>

        {/* Remarks */}
        <View style={{ flex: 1.3 }}>
          <Text style={styles.heading}>Remarks</Text>
          {row.remarks?.trim() ? (
            <Text style={styles.remarks}>{pdfSafe(row.remarks.trim())}</Text>
          ) : (
            <Text style={styles.italicMuted}>No remarks.</Text>
          )}
          <Text style={styles.closedLine}>{pdfSafe(noteState)}</Text>
        </View>
      </View>

      {/* Phase 2 notes and flags */}
      <View style={styles.phase2}>
        <Text style={styles.heading}>Phase 2 — notes and flags</Text>
        <View style={styles.columns}>
          {PHASE2_SECTIONS.map((section) => {
            const tone = SECTION_TONE[section.tone];
            const entries = row.phase2Entries.filter(
              (e) => e.type === (section.type as Phase2EntryType),
            );
            return (
              <View key={section.type} style={{ flex: 1 }}>
                <Text style={[styles.entryHeading, { color: tone.heading }]}>
                  {section.label} ({entries.length})
                </Text>
                {entries.length === 0 ? (
                  <Text style={styles.italicMuted}>Nothing recorded.</Text>
                ) : (
                  entries.map((e) => (
                    <View
                      key={e.id}
                      wrap={false}
                      style={[
                        styles.entry,
                        { borderLeftColor: tone.border, backgroundColor: tone.bg },
                      ]}
                    >
                      <Text style={styles.entryText}>{pdfSafe(e.text)}</Text>
                      <Text style={styles.entryMeta}>
                        {pdfSafe(e.authorName)} ·{" "}
                        {formatTunisDateTime(new Date(e.createdAtISO))}
                      </Text>
                    </View>
                  ))
                )}
              </View>
            );
          })}
        </View>
      </View>

      <Footer campaignName={campaignName} />
    </Page>
  );
}

/**
 * Render the interview-reviews PDF. Sorts here, so "best interview first" is
 * stated in exactly one place no matter who calls it: un-interviewed applicants
 * go last, ties break by name.
 */
export async function renderInterviewReviewsPdf({
  campaignName,
  generatedAt,
  rows,
}: Props): Promise<Buffer> {
  const ordered = [...rows].sort(compareByInterview("desc"));
  return renderToBuffer(
    <Document
      title={`Interview Reviews — ${campaignName}`}
      author="GDGC ISSATSo"
      subject="Candidate scorecards for the decision meeting"
    >
      <Cover
        campaignName={campaignName}
        generatedAt={generatedAt}
        rows={ordered}
      />
      {ordered.map((row, i) => (
        <ApplicantPage
          key={row.id}
          row={row}
          index={i}
          total={ordered.length}
          campaignName={campaignName}
        />
      ))}
    </Document>,
  );
}
