import { writeFileSync } from "node:fs";
import { faker } from "@faker-js/faker";

// Generates a synthetic CSV with the same column structure as the real
// applicant-form export, for import-performance benchmarking. Run with:
//   npx tsx scripts/generate-fake-import-csv.ts [rowCount] [outFile]

const ROW_COUNT = Number(process.argv[2] ?? 150);
const OUT_FILE =
  process.argv[3] ??
  `test-fixtures/fake_recruitment_2026_responses_${ROW_COUNT}.csv`;

const HEADERS = [
  "Timestamp",
  "Email",
  "Full name",
  "Are you an ISSATSO student?",
  "Which one of our three committees do you think is most suitable for you ?",
  "Why do you want to join GDGC?",
];

const COMMITTEES = [
  "Marketing (MKT)",
  "Team Management (TM)",
  "Events & External Relations (EER)",
];

function csvField(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

const rows: string[][] = [];
for (let i = 0; i < ROW_COUNT; i++) {
  const fullName = faker.person.fullName();
  const email = faker.internet.email({ provider: "gmail.com" }).toLowerCase();
  // ~85% ISSATSO students, matching the real applicant pool shape, so most
  // rows exercise the normal import path and a handful exercise auto-reject.
  const isIssatso = faker.datatype.boolean({ probability: 0.85 })
    ? "Yes"
    : "No";
  const committee = faker.helpers.arrayElement(COMMITTEES);
  const motivation = faker.lorem.sentences(2);
  const timestamp = faker.date.recent({ days: 14 }).toISOString();

  rows.push([timestamp, email, fullName, isIssatso, committee, motivation]);
}

const lines = [HEADERS, ...rows].map((r) => r.map(csvField).join(","));
writeFileSync(OUT_FILE, lines.join("\n") + "\n", "utf8");
console.log(`Wrote ${ROW_COUNT} rows to ${OUT_FILE}`);
