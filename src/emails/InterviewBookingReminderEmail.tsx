import { Link, Text } from "@react-email/components";
import {
  BaseEmailLayout,
  bodyLink,
  paragraph,
  signOff,
  teamName,
} from "./components/BaseEmailLayout";

/**
 * Booking reminder, sent to shortlisted applicants who still haven't picked a
 * slot. Unlike the Phase 1 emails this one is expected to go out more than
 * once, so the batch that sends it deliberately does not dedup on EmailLog.
 *
 * Wording is reproduced verbatim from the club's established template — do not
 * paraphrase or "improve" the copy; only {name} and the calendar link are
 * interpolated. That includes the club's French-style spacing before `,` `!`
 * and `:`, and "Google Developer Group" (singular) in the sign-off, which
 * differs from the invite's "Groups" in the source as written.
 *
 * `calendarLink` comes from Campaign.interviewCalendarLink — required, with no
 * default, so the reminder can never point somewhere different from the invite.
 */
export function InterviewBookingReminderEmail({
  name,
  calendarLink,
}: {
  name: string;
  calendarLink: string;
}) {
  return (
    <BaseEmailLayout preview="Reminder: book your GDGC ISSATSo interview slot">
      <Text style={paragraph}>Dear {name} ,</Text>
      <Text style={paragraph}>We hope you&apos;re doing extremely well !</Text>
      <Text style={paragraph}>
        We wanted to kindly remind you to book your interview slot for the GDGC
        recruitment process if you haven&apos;t done so yet.
      </Text>
      <Text style={paragraph}>
        The interview process has already started, and slots are filling up
        quickly! Please make sure to choose the time that works best for you
        using the calendar link below :
      </Text>
      <Text style={paragraph}>
        Calendar Link:{" "}
        <Link href={calendarLink} style={bodyLink}>
          {calendarLink}
        </Link>
      </Text>
      <Text style={paragraph}>
        Remember that bookings are made on a{" "}
        <strong>First-Come, First-Served basis.</strong>
      </Text>
      <Text style={paragraph}>
        <strong>Important:</strong> Since the exact interview room will only be
        confirmed shortly before each session,{" "}
        <strong>
          we ask that you come to the library 5 minutes before your interview.
        </strong>{" "}
        A core team member will meet you there and guide you to the room.
      </Text>
      <Text style={signOff}>Thanks for your time,</Text>
      <Text style={teamName}>
        The Google Developer Group On Campus - ISSATSo Family
      </Text>
    </BaseEmailLayout>
  );
}

export default InterviewBookingReminderEmail;
