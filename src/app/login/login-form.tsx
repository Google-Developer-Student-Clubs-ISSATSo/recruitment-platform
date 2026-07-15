"use client";

import { useActionState } from "react";

import { Logo } from "@/components/logo";

import { requestMagicLink, type LoginState } from "./actions";

const initialState: LoginState = { status: "idle" };

function MailIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <rect
        x="3"
        y="5"
        width="18"
        height="14"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="m4 7 8 5 8-5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function LoginForm() {
  const [state, formAction, pending] = useActionState(
    requestMagicLink,
    initialState,
  );

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="rounded-lg border border-neutral-200 bg-white p-8 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          {/* Brand */}
          <div className="flex flex-col items-center text-center">
            <Logo className="h-14 w-14 rounded-xl" alt="GDGC Recruitment Platform" />
            <h1 className="mt-4 text-lg font-semibold text-foreground">
              GDGC Recruitment Platform
            </h1>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              {state.status === "sent"
                ? "Recruitment Platform Portal"
                : "Enter your email to sign in."}
            </p>
          </div>

          {state.status === "sent" ? (
            /* Confirmation state — no inputs, just a confirmation message. */
            <div className="mt-8 flex flex-col items-center text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <MailIcon className="h-6 w-6" />
              </div>
              <h2 className="mt-4 text-sm font-semibold text-foreground">
                Check your email
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-neutral-500 dark:text-neutral-400">
                We sent a sign-in link to{" "}
                <span className="font-medium text-foreground">
                  {state.email}
                </span>
                . The link expires in 24 hours.
              </p>
            </div>
          ) : (
            /* Default state — single email field to sign in. */
            <form action={formAction} className="mt-8 space-y-4">
                <div className="space-y-1.5">
                  <label
                    htmlFor="email"
                    className="block text-xs font-semibold tracking-wider text-neutral-500 dark:text-neutral-400"
                  >
                    EMAIL ADDRESS
                  </label>
                  <div className="relative">
                    <MailIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                    <input
                      id="email"
                      type="email"
                      name="email"
                      required
                      autoFocus
                      defaultValue={state.email}
                      placeholder="you@gdgc.edu"
                      autoComplete="email"
                      className="w-full rounded-lg border border-neutral-300 bg-white py-2.5 pl-10 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-neutral-400 focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-neutral-700 dark:bg-neutral-950"
                    />
                  </div>
                </div>

                {state.status === "error" && state.message && (
                  <p className="text-sm text-status-rejected">{state.message}</p>
                )}

                <button
                  type="submit"
                  disabled={pending}
                  className="flex w-full items-center justify-center rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {pending ? "Signing in…" : "Sign in with Email"}
                </button>
            </form>
          )}

          {/* Footer */}
          <div className="mt-8 border-t border-neutral-200 pt-4 text-center dark:border-neutral-800">
            <p className="text-xs text-neutral-400 dark:text-neutral-500">
              Systematic Access Only · Internal GDGC Operations
            </p>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-neutral-400 dark:text-neutral-600">
          © <span>{new Date().getFullYear()}</span> GDGC Recruitment Platform
        </p>
      </div>
    </main>
  );
}
