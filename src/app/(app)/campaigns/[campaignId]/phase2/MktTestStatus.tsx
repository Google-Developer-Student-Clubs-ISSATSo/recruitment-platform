// How far an applicant got with the marketing test, as one pill — shared by the
// ranked-list card header and both MKT skills tables, so "not submitted" reads
// the same everywhere. Hook-free, usable from server or client.

import { Icon } from "@/components/app-shell/icon";
import { MKT_TESTS, submittedTestCount, type MktTests } from "@/lib/phase2";

/**
 * Green once every test has a link, amber otherwise — amber being the app's
 * "still waiting on something" colour, which is exactly what a missing
 * submission is. `compact` drops the word "Test" for the narrow card header.
 */
export function MktTestStatus({
  tests,
  compact = false,
}: {
  tests: MktTests;
  compact?: boolean;
}) {
  const done = submittedTestCount(tests);
  const total = MKT_TESTS.length;
  const complete = done === total;
  const label = done === 0 ? "No test" : `Test ${done}/${total}`;

  return (
    <span
      title={
        done === 0
          ? "No marketing test submitted"
          : `${done} of ${total} marketing tests submitted`
      }
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        complete
          ? "bg-status-accepted/10 text-status-accepted-text"
          : "bg-status-pending/15 text-status-pending-text"
      }`}
    >
      <Icon
        name={complete ? "check_circle" : "pending"}
        className="text-[13px]"
      />
      {compact && done > 0 ? `${done}/${total}` : label}
    </span>
  );
}

/** For screen-reader labels: "no marketing test", "1 of 2 marketing tests". */
export function mktTestStatusText(tests: MktTests): string {
  const done = submittedTestCount(tests);
  return done === 0
    ? "no marketing test submitted"
    : `${done} of ${MKT_TESTS.length} marketing tests submitted`;
}
