import { Link, Text } from "@react-email/components";
import {
  BaseEmailLayout,
  bodyLink,
  paragraph,
  signOff,
  teamName,
} from "./components/BaseEmailLayout";

/**
 * The rejection email, sent to every REJECTED_FINAL applicant once final
 * decisions are signed off. Wording is reproduced verbatim from the club's
 * established template — do not paraphrase or soften the copy, including the
 * French-style space before the comma in "Dear {name} ,".
 *
 * The Discord invite is a required prop read from the campaign: the whole point
 * of the last paragraphs is that the applicant can reach a community manager
 * for interview feedback, so a stale or missing invite would break the one
 * thing this email is offering.
 *
 * Uses the same BaseEmailLayout as the Phase 1 and interview emails, with the
 * banner at the top rather than the bottom — see FinalAcceptanceEmail.
 */
export function FinalRejectionEmail({
  name,
  discordInviteLink,
}: {
  name: string;
  discordInviteLink: string;
}) {
  return (
    <BaseEmailLayout
      preview="Response to joining GDGC - ISSATSo Core Team"
      bannerPosition="top"
    >
      <Text style={paragraph}>Dear {name} ,</Text>

      <Text style={paragraph}>
        Thank you once again for the interest you have shown for{" "}
        <strong>GDGC ISSATSo</strong>. We truly appreciate the time and effort
        you have invested to join our team and become a board member. We had the
        pleasure to meet you and enjoy having{" "}
        <strong>impressive and fascinating conversations</strong> with you. We
        also learned a lot about your outstanding skills.
      </Text>

      <Text style={paragraph}>
        We regret to inform you that your application will not be moving
        forward. While your profile is pretty interesting, we were unable to
        offer you a position on our core team as the selection process was{" "}
        <strong>extremely challenging</strong> and the positions were{" "}
        <strong>very limited</strong>. It&apos;s with deep regret that we took
        this hard decision because we believe you are a really strong candidate
        for our club.
      </Text>

      <Text style={paragraph}>
        Thus, we would love to, at least, give you feedback about your interview
        so you can rock any other interview in further stages. We invite you to
        contact one of our community managers on our{" "}
        <Link href={discordInviteLink} style={bodyLink}>
          Discord server
        </Link>{" "}
        to get more details. We look forward to providing you with valuable
        insights and are more than happy to answer any of your questions.
      </Text>

      <Text style={paragraph}>
        We would love to see you at our events and for you to get engaged with
        our community as we look forward to the possibility of welcoming you to
        our core team in the next mandate.
      </Text>

      <Text style={paragraph}>
        We wish you the best of luck in your future experiences and hope we will
        have a chance to meet again soon.
      </Text>

      <Text style={signOff}>Sincerely,</Text>

      <Text style={teamName}>
        The Google Developer Groups On Campus - ISSATSo Team
      </Text>
    </BaseEmailLayout>
  );
}

export default FinalRejectionEmail;
