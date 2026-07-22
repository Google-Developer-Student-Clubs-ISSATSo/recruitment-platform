import { Link, Text } from "@react-email/components";
import {
  BaseEmailLayout,
  bodyLink,
  paragraph,
  subheading,
  teamName,
} from "./components/BaseEmailLayout";

/**
 * The offer email, sent to every ACCEPTED applicant once final decisions are
 * signed off. Wording is reproduced verbatim from the club's established
 * template — do not paraphrase or "improve" the copy. That includes the
 * French-style space before the comma in "Dear {name} ,", which is in the
 * source as written.
 *
 * Only the name, the committee label and the three links are interpolated. All
 * three links are required props with no default, read from the campaign, so a
 * cycle that hasn't configured them can't quietly send last year's URLs.
 *
 * Uses the same BaseEmailLayout as the Phase 1 and interview emails — identical
 * background, font, spacing and footer. The one difference is bannerPosition:
 * these two open with the banner rather than closing with it.
 */
export function FinalAcceptanceEmail({
  name,
  committee,
  acceptanceFormLink,
  gdgcProgramLink,
  gdgcPlatformLink,
}: {
  name: string;
  committee: string;
  acceptanceFormLink: string;
  gdgcProgramLink: string;
  gdgcPlatformLink: string;
}) {
  return (
    <BaseEmailLayout
      preview="You've been selected for the GDGC ISSATSo Core Team"
      bannerPosition="top"
    >
      <Text style={paragraph}>Dear {name} ,</Text>

      <Text style={paragraph}>
        Congratulations! We are thrilled to inform you that you have been
        selected as a Google Developer Groups On Campus Core team member! The
        recruitment process was an extremely challenging and competitive task,
        but you have genuinely stood out! Your performance throughout this
        process was exceptional, and your outstanding profile impressed the
        whole team. Great job!
      </Text>

      <Text style={paragraph}>
        You are joining an amazing community of Google developer groups who are
        present in thousands of colleges and universities across the globe. We
        have admitted you because we think that you will be able to make an
        important contribution not just to the Google Developer Groups on Campus
        - ISSATSo community but also to the global Google Developers Ecosystem.
      </Text>

      <Text style={paragraph}>
        After careful consideration, we have assigned you to the{" "}
        <strong>{committee}</strong> committee where we believe you can do
        wonders and where you&apos;ll find an amazing family to spend the
        adventure with.
      </Text>

      <Text style={subheading}>What do you need to do next?</Text>

      <Text style={paragraph}>
        Please complete this Acceptance Form{" "}
        <Link href={acceptanceFormLink} style={bodyLink}>
          Acceptance Form
        </Link>{" "}
        within 24 hours of receiving this email to confirm that you accept the
        role of Google DGC Core Team member. Please note that not filling the
        Acceptance Form by the deadline means that you are declining the role of
        Google DGC Core Team member.
      </Text>

      <Text style={paragraph}>
        After completing the form you can find out more about our program{" "}
        <Link href={gdgcProgramLink} style={bodyLink}>
          GDGC Program
        </Link>{" "}
        and about our club by checking out our website at{" "}
        <Link href={gdgcPlatformLink} style={bodyLink}>
          GDGC Platform
        </Link>
        .
      </Text>

      <Text style={paragraph}>
        Google Developer Groups On Campus - ISSATSo team is very proud to be
        able to attract so many outstanding scholars like yourself. We look
        forward to having you join us and contribute to our dynamic and
        stimulating intellectual environment.
      </Text>

      <Text style={paragraph}>Welcome Onboard!</Text>

      <Text style={teamName}>
        The Google Developer Groups On Campus - ISSATSo Team
      </Text>
    </BaseEmailLayout>
  );
}

export default FinalAcceptanceEmail;
