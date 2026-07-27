import { Link, Text } from "@react-email/components";
import {
  BaseEmailLayout,
  bodyLink,
  paragraph,
  signOff,
  subheading,
  teamName,
} from "./components/BaseEmailLayout";

/**
 * Admin-role transfer invitation, sent to the TM member being offered the
 * Administrator (TM Lead) role.
 *
 * Unlike every other template here this one is internal — it goes to a core
 * team member, not an applicant — but it deliberately reuses BaseEmailLayout so
 * there is exactly one outbound look for the platform.
 *
 * `acceptUrl` is a required prop with no default: an invite email whose link is
 * missing or stale is worse than no email at all, so the caller must always
 * build it from the invite's real token.
 */
export function AdminTransferInviteEmail({
  recipientName,
  initiatorName,
  acceptUrl,
}: {
  recipientName: string;
  initiatorName: string;
  acceptUrl: string;
}) {
  return (
    <BaseEmailLayout
      preview="You have been invited to take over the GDGC ISSATSo Administrator role"
      bannerPosition="top"
    >
      <Text style={paragraph}>Dear {recipientName},</Text>
      <Text style={paragraph}>
        <strong>{initiatorName}</strong> has invited you to take over the{" "}
        <strong>Administrator (TM Lead)</strong> role on the GDGC ISSATSo
        Recruitment Platform.
      </Text>
      <Text style={paragraph}>
        The Administrator manages member accounts and permissions for the whole
        recruitment cycle. There is only ever one Administrator at a time, so
        accepting this invite will transfer the role from{" "}
        <strong>{initiatorName}</strong> to you, and their account will be
        downgraded to TM Reviewer immediately.
      </Text>

      <Text style={subheading}>What do you need to do next?</Text>
      <Text style={paragraph}>
        Sign in with this email address and open the link below to accept the
        transfer:
      </Text>
      <Text style={paragraph}>
        <Link href={acceptUrl} style={bodyLink}>
          {acceptUrl}
        </Link>
      </Text>
      <Text style={paragraph}>
        This invitation expires <strong>48 hours</strong> after it was sent. If
        you were not expecting it, you can safely ignore this email — nothing
        changes unless you open the link and confirm.
      </Text>

      <Text style={signOff}>Sincerely,</Text>
      <Text style={teamName}>
        The Google Developer Groups On Campus - ISSATSo Family
      </Text>
    </BaseEmailLayout>
  );
}

export default AdminTransferInviteEmail;
