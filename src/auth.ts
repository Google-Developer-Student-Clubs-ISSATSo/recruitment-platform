import NextAuth from "next-auth";
import Nodemailer from "next-auth/providers/nodemailer";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { createTransport } from "nodemailer";

import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity-log";
import { SMTP_TRANSPORT } from "@/lib/email";

function magicLinkEmail(url: string, host: string) {
  const text = [
    "Sign in to the GDGC Recruitment Platform",
    "",
    `Use this link to sign in: ${url}`,
    "",
    "This link is valid for 24 hours and can only be used once.",
    "If you didn't request it, you can safely ignore this email.",
  ].join("\n");

  const html = `
  <div style="background:#f6f7f9;padding:32px 0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td align="center">
        <table role="presentation" width="440" cellpadding="0" cellspacing="0"
               style="background:#ffffff;border-radius:12px;padding:32px;border:1px solid #e6e8eb;">
          <tr><td style="font-size:18px;font-weight:600;color:#1a1a1a;padding-bottom:8px;">
            GDGC Recruitment Platform
          </td></tr>
          <tr><td style="font-size:14px;color:#5f6368;padding-bottom:24px;">
            Click the button below to sign in to <strong>${host}</strong>.
          </td></tr>
          <tr><td align="center" style="padding-bottom:24px;">
            <a href="${url}"
               style="background:#1a73e8;color:#ffffff;text-decoration:none;font-size:15px;
                      font-weight:600;padding:12px 28px;border-radius:8px;display:inline-block;">
              Sign in
            </a>
          </td></tr>
          <tr><td style="font-size:12px;color:#80868b;line-height:1.5;">
            This link is valid for 24 hours and can only be used once.
            If you didn't request it, you can safely ignore this email.
          </td></tr>
        </table>
      </td></tr>
    </table>
  </div>`;

  return { text, html };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),

  // Database-backed sessions so access can be revoked server-side (deleting the
  // Session row cuts a user off immediately) rather than only expiring in a JWT.
  session: { strategy: "database" },

  // We run behind a plain Node server / local dev, so trust the host header
  // instead of requiring an explicit AUTH_URL.
  trustHost: true,

  pages: {
    signIn: "/login",
    verifyRequest: "/login?sent=1",
    error: "/login",
  },

  providers: [
    Nodemailer({
      from: process.env.EMAIL_FROM,
      // The Nodemailer provider throws unless `server` is present, even when we
      // override sendVerificationRequest below, so we supply the SMTP config here too.
      server: SMTP_TRANSPORT,
      async sendVerificationRequest({ identifier, url, provider }) {
        const { host } = new URL(url);
        const { text, html } = magicLinkEmail(url, host);

        const transport = createTransport(SMTP_TRANSPORT);
        const result = await transport.sendMail({
          to: identifier,
          from: provider.from,
          subject: "Sign in to the GDGC Recruitment Platform",
          text,
          html,
        });

        const failed = [
          ...(result.rejected ?? []),
          ...(result.pending ?? []),
        ].filter(Boolean);
        if (failed.length) {
          throw new Error(
            `Magic-link email (${failed.join(", ")}) could not be sent`,
          );
        }
      },
    }),
  ],

  callbacks: {
    async signIn({ user, email }) {
      if (email?.verificationRequest) {
        const address = user.email?.toLowerCase();
        if (!address) return false;
        const existing = await prisma.user.findUnique({
          where: { email: address },
        });
        if (!existing) return false;
        await logActivity({
          actorId: existing.id,
          actionType: "MAGIC_LINK_REQUESTED",
          details: { email: address },
        });
        return true;
      }
      return true;
    },
  },

  events: {
    async signIn(message) {
      if (message.user?.id) {
        await logActivity({
          actorId: message.user.id,
          actionType: "SIGNED_IN",
        });
      }
    },
    async signOut(message) {
      const userId = "session" in message ? message.session?.userId : undefined;
      if (userId) {
        await logActivity({
          actorId: userId,
          actionType: "SIGNED_OUT",
        });
      }
    },
  },
});
