"use server";

import { AuthError } from "next-auth";

import { signIn } from "@/auth";

export type LoginState = {
  status: "idle" | "sent" | "error";
  message?: string;
  email?: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function requestMagicLink(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  if (!EMAIL_RE.test(email)) {
    return { status: "error", email, message: "Please enter a valid email address." };
  }

  try {
    const result = await signIn("nodemailer", { email, redirect: false });

    // Auth.js re-throws AuthError (e.g. AccessDenied) but reports non-auth
    // failures — like SMTP being unreachable — as an `error=` redirect URL.
    if (typeof result === "string" && result.includes("error=")) {
      return {
        status: "error",
        email,
        message: "We couldn't send the magic link right now. Please try again in a moment.",
      };
    }
  } catch (error) {
    // STEP 4: the signIn callback in auth.ts rejects unknown emails with
    // AccessDenied — surface that as an invite-only message. No email was sent.
    if (error instanceof AuthError && error.type === "AccessDenied") {
      return {
        status: "error",
        email,
        message: "That email isn't registered. Access is invite-only — please contact an admin.",
      };
    }
    return { status: "error", email, message: "Something went wrong. Please try again." };
  }

  return { status: "sent", email };
}
