"use client";

import { useTransition } from "react";

import { Icon } from "./icon";
import { logout } from "./actions";

export function LogoutButton() {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => logout())}
      className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-neutral-500 transition-colors hover:bg-neutral-100 disabled:opacity-60 dark:text-neutral-400 dark:hover:bg-neutral-800"
    >
      <Icon name="logout" className="text-[20px]" />
      <span>{pending ? "Signing out…" : "Log Out"}</span>
    </button>
  );
}
