"use server";

import { headers } from "next/headers";
import { AuthError } from "next-auth";

import { signIn } from "@/auth";
import { rateLimit } from "@/lib/rate-limit";

export type LoginState = {
  status: "idle" | "sent" | "error";
  message?: string;
  email?: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Magic-link request throttling. Invite-only internal tool, single Node server,
// so an in-memory limiter is the whole story (see rate-limit.ts). Two independent
// caps, either of which trips:
//   - per email — stops someone hammering ONE person's inbox.
//   - per IP    — stops one client probing MANY emails to enumerate who's
//                 registered. Set a little higher than the email cap so a shared
//                 office NAT with a few staff signing in isn't falsely blocked.
const WINDOW_MS = 15 * 60 * 1000;
const PER_EMAIL_LIMIT = 5;
const PER_IP_LIMIT = 10;

// Every request is padded to at least this long before returning. The unknown-
// email path rejects almost instantly (a single indexed lookup) while a real
// send waits on SMTP; without a floor that gap is itself an existence oracle.
// The floor removes the "instant reject" tell — combined with the rate limit
// above (at most a handful of probes per window) enumeration by timing is not
// practical. NOTE: a successful SMTP send can still exceed the floor, so the
// channel is narrowed, not mathematically closed; fully closing it would mean
// moving the send off the request path (fire-and-forget), which would lose the
// "couldn't send" error surfaced below.
const MIN_RESPONSE_MS = 600;

async function clientIp(): Promise<string> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return h.get("x-real-ip")?.trim() || "unknown";
}

async function withFloor<T>(startedAt: number, value: T): Promise<T> {
  const elapsed = Date.now() - startedAt;
  if (elapsed < MIN_RESPONSE_MS) {
    await new Promise((r) => setTimeout(r, MIN_RESPONSE_MS - elapsed));
  }
  return value;
}

export async function requestMagicLink(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const startedAt = Date.now();

  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  if (!EMAIL_RE.test(email)) {
    return withFloor(startedAt, {
      status: "error" as const,
      email,
      message: "Please enter a valid email address.",
    });
  }

  // Throttle BEFORE any DB work or send. Both keys are derived only from the
  // submitted email + caller IP, never from whether the account exists, so the
  // limit behaves identically for real and unknown addresses.
  const ip = await clientIp();
  const emailGate = rateLimit(`magic-link:email:${email}`, PER_EMAIL_LIMIT, WINDOW_MS);
  const ipGate = rateLimit(`magic-link:ip:${ip}`, PER_IP_LIMIT, WINDOW_MS);
  if (!emailGate.ok || !ipGate.ok) {
    const mins = Math.ceil(
      Math.max(emailGate.retryAfterSeconds, ipGate.retryAfterSeconds) / 60,
    );
    return withFloor(startedAt, {
      status: "error" as const,
      email,
      message: `Too many sign-in attempts. Please try again in about ${mins} minute${mins === 1 ? "" : "s"}.`,
    });
  }

  try {
    const result = await signIn("nodemailer", { email, redirect: false });

    // Auth.js re-throws AuthError (e.g. AccessDenied) but reports non-auth
    // failures — like SMTP being unreachable — as an `error=` redirect URL.
    if (typeof result === "string" && result.includes("error=")) {
      return withFloor(startedAt, {
        status: "error" as const,
        email,
        message: "We couldn't send the magic link right now. Please try again in a moment.",
      });
    }
  } catch (error) {
    // The signIn callback in auth.ts rejects unknown emails with AccessDenied —
    // surface that as an invite-only message. No email was sent.
    if (error instanceof AuthError && error.type === "AccessDenied") {
      return withFloor(startedAt, {
        status: "error" as const,
        email,
        message: "That email isn't registered. Access is invite-only — please contact an admin.",
      });
    }
    return withFloor(startedAt, {
      status: "error" as const,
      email,
      message: "Something went wrong. Please try again.",
    });
  }

  return withFloor(startedAt, { status: "sent" as const, email });
}
