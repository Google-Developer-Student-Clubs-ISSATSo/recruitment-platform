import { Text } from "@react-email/components";
import {
  BaseEmailLayout,
  paragraph,
  signOff,
  teamName,
} from "./components/BaseEmailLayout";

// The club is based in Sousse, Tunisia, so GDG Day times are always expressed in
// local Tunisian time regardless of where this code runs. Fixing the zone keeps
// the rendered date deterministic (no drift from the server's TZ).
const TIME_ZONE = "Africa/Tunis";

function ordinalSuffix(day: number): string {
  if (day >= 11 && day <= 13) return "th";
  switch (day % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

/** e.g. "Saturday, November 1st at 3:00 PM". */
export function formatGdgDayDateTime(dateTime: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(dateTime);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";

  const weekday = get("weekday");
  const month = get("month");
  const day = Number(get("day"));
  const hour = get("hour");
  const minute = get("minute");
  const dayPeriod = get("dayPeriod");

  return `${weekday}, ${month} ${day}${ordinalSuffix(day)} at ${hour}:${minute} ${dayPeriod}`;
}

/**
 * Phase 1 acceptance email. Wording is reproduced verbatim from the club's
 * established template, except the GDG Day date/time/location, which last year
 * were hardcoded and are now interpolated from the campaign. Emphasis from the
 * original is preserved: the date/time/location line and the "mandatory"
 * sentence are bold, "mandatory" is also underlined.
 */
export function PhaseOneAcceptanceEmail({
  name,
  gdgDayDateTime,
  gdgDayLocation,
}: {
  name: string;
  gdgDayDateTime: Date;
  gdgDayLocation: string;
}) {
  const when = formatGdgDayDateTime(gdgDayDateTime);

  return (
    <BaseEmailLayout preview="Your GDGC-ISSATSo application has advanced!">
      <Text style={paragraph}>Dear {name},</Text>
      <Text style={paragraph}>We hope you&apos;re doing great!</Text>
      <Text style={paragraph}>
        We are excited to inform you that your application to join GDGC-ISSATSo
        has advanced to the next stage of the selection process.
      </Text>
      <Text style={paragraph}>
        The next phase of the selection process will involve attending GDGC Day
        and participating in an interview.
      </Text>
      <Text style={paragraph}>
        GDGC Day is an open day where you can learn more about our club, meet
        current members, and participate in various fun activities.
        <strong>
          It will take place {when} at {gdgDayLocation}.
        </strong>
      </Text>
      <Text style={paragraph}>
        Please keep in mind that your presence for GDGC day is{" "}
        <strong>
          <u>mandatory</u>
        </strong>{" "}
        to proceed with your recruitment process. However, kindly note in mind
        that GDGC&apos;s open day is not for recruitment interviews.
      </Text>
      <Text style={paragraph}>
        Also, It would be great if you grab your laptop with you as we are
        planning to do some technical activities that you may be part of. If you
        can&apos;t bring your laptop with you, it&apos;s okay! Just grab your
        motivation and enthusiasm with you, and a PC will be waiting for you.
      </Text>
      <Text style={paragraph}>
        We can&apos;t wait to meet you this Saturday!
      </Text>
      <Text style={signOff}>Sincerely,</Text>
      <Text style={teamName}>
        The Google Developer Groups On Campus - ISSATSo Team
      </Text>
    </BaseEmailLayout>
  );
}

export default PhaseOneAcceptanceEmail;
