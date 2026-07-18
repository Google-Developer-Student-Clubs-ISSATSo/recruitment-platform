import { Text } from "@react-email/components";
import {
  BaseEmailLayout,
  paragraph,
  signOff,
  teamName,
} from "./components/BaseEmailLayout";

/**
 * Phase 1 rejection email. Wording is reproduced verbatim from the club's
 * established template — do not paraphrase or "improve" the copy; only {name}
 * is interpolated.
 */
export function PhaseOneRejectionEmail({ name }: { name: string }) {
  return (
    <BaseEmailLayout preview="Your GDGC ISSATSo application — update">
      <Text style={paragraph}>Dear {name},</Text>
      <Text style={paragraph}>
        We want to thank you for investing your time in filling out our
        application.
      </Text>
      <Text style={paragraph}>
        Unfortunately, in reference to your application to join GDGC ISSATSo core
        team, our team did not select you for further consideration and decided
        to proceed with the selection process with other candidates.
      </Text>
      <Text style={paragraph}>
        We were impressed by your skills and experiences and we highly encourage
        you to keep moving forward and consider other opportunities.
      </Text>
      <Text style={paragraph}>
        We believe you have a significant role to play in our community&apos;s
        success, and we invite you to continue your involvement as an active
        community member.
      </Text>
      <Text style={paragraph}>
        Please keep in mind that this process is highly competitive and we have
        to select a very limited number of applicants imposed by Google&apos;s
        guidelines and policies.
      </Text>
      <Text style={paragraph}>
        Thank you again for your interest, time, and effort and we are excited to
        see you in our upcoming events.
      </Text>
      <Text style={signOff}>Sincerely,</Text>
      <Text style={teamName}>
        The Google Developer Groups on Campus - ISSATSo Team
      </Text>
    </BaseEmailLayout>
  );
}

export default PhaseOneRejectionEmail;
