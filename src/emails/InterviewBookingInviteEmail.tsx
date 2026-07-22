import { Link, Text } from "@react-email/components";
import {
  BaseEmailLayout,
  bodyLink,
  paragraph,
  signOff,
  teamName,
} from "./components/BaseEmailLayout";

/**
 * Interview booking invitation, sent to shortlisted applicants after GDGC Day.
 * Wording is reproduced verbatim from the club's established template — do not
 * paraphrase or "improve" the copy; only {name} and the calendar link are
 * interpolated. That includes the club's French-style spacing before `,` `!`
 * and `:`, and "Thank for your time" in the sign-off, both of which are in the
 * source as written.
 *
 * `calendarLink` comes from Campaign.interviewCalendarLink — it is deliberately
 * a required prop with no default, so a campaign that hasn't configured one
 * can't silently send a stale link from a previous cycle.
 */
export function InterviewBookingInviteEmail({
  name,
  calendarLink,
}: {
  name: string;
  calendarLink: string;
}) {
  return (
    <BaseEmailLayout preview="Book your GDGC ISSATSo interview slot">
      <Text style={paragraph}>Dear {name} ,</Text>
      <Text style={paragraph}>We hope you&apos;re doing extremely well !</Text>
      <Text style={paragraph}>
        We want to thank you for making the time and attending the GDGC Day. We
        wanted to meet you in person and get to know you better and spending
        time with you was a pure pleasure.
      </Text>
      <Text style={paragraph}>
        The purpose of the games we played was to lighten up the mood and bring
        us closer. Losing or winning won&apos;t affect the selection process.
      </Text>
      <Text style={paragraph}>
        It is our pleasure to announce that this week we are starting the
        interviews, so make sure to book the slot that works for you best in the
        calendar below.
      </Text>
      <Text style={paragraph}>
        Please note that the interview booking system is based on a{" "}
        <strong>First-In-First-Served</strong> process.
      </Text>
      <Text style={paragraph}>
        <strong>Important:</strong> Since the exact interview room will only be
        confirmed shortly before each session,{" "}
        <strong>
          we ask that you come to the library 5 minutes before your interview.
        </strong>{" "}
        A core team member will meet you there and guide you to the room.
      </Text>
      <Text style={paragraph}>
        Calendar Link:{" "}
        <Link href={calendarLink} style={bodyLink}>
          {calendarLink}
        </Link>
      </Text>
      <Text style={signOff}>Thank for your time,</Text>
      <Text style={teamName}>
        The Google Developer Groups On Campus - ISSATSo Family
      </Text>
    </BaseEmailLayout>
  );
}

export default InterviewBookingInviteEmail;
