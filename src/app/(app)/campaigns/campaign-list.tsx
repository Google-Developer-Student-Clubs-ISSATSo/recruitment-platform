"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";

import { Icon } from "@/components/app-shell/icon";
import { splitTimestamp } from "@/lib/activity-descriptions";
import {
  createCampaign,
  type CreateCampaignState,
} from "./actions";

export type CampaignCard = {
  id: string;
  name: string;
  isOpen: boolean;
  createdAtISO: string;
};

const createInitial: CreateCampaignState = { status: "idle" };

export function CampaignList({
  campaigns,
  canCreate,
  denied,
}: {
  campaigns: CampaignCard[];
  /** Whether to show the Create Campaign control (MANAGE_CAMPAIGNS/ACCOUNTS). */
  canCreate: boolean;
  /** Show the access-denied banner (bounced here from a page they can't reach). */
  denied: boolean;
}) {
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {denied && (
        <div className="rounded-lg border border-status-rejected/30 bg-status-rejected/10 px-4 py-3 text-sm font-medium text-status-rejected">
          You don&apos;t have access to that page.
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Campaigns</h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Choose a recruitment campaign to work in. Everything else — the
            applicant pool, screening, interviews — is scoped to the campaign you
            pick.
          </p>
        </div>
        {canCreate && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
          >
            <Icon name="add" className="text-[18px]" />
            Create Campaign
          </button>
        )}
      </div>

      {campaigns.length === 0 ? (
        <div className="rounded-xl border border-neutral-200 bg-white p-10 text-center dark:border-neutral-800 dark:bg-neutral-900">
          <p className="text-sm font-medium text-foreground">
            No campaigns available to you yet.
          </p>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            When a campaign you can access is open, it will appear here.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {campaigns.map((c) => (
            <CampaignRow key={c.id} campaign={c} />
          ))}
        </ul>
      )}

      {showCreate && <CreateCampaignModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}

function CampaignRow({ campaign }: { campaign: CampaignCard }) {
  const { date } = splitTimestamp(campaign.createdAtISO);
  return (
    <li className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="min-w-0">
        <div className="flex items-center gap-3">
          <h2 className="truncate text-lg font-semibold text-foreground">
            {campaign.name}
          </h2>
          <StatusBadge isOpen={campaign.isOpen} />
        </div>
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          Created {date}
        </p>
      </div>
      <Link
        href={`/campaigns/${campaign.id}/dashboard`}
        className="flex items-center gap-2 rounded-lg border border-primary px-4 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/10"
      >
        Enter
        <Icon name="arrow_forward" className="text-[18px]" />
      </Link>
    </li>
  );
}

function StatusBadge({ isOpen }: { isOpen: boolean }) {
  return isOpen ? (
    <span className="rounded-full bg-status-accepted/10 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-status-accepted">
      Open
    </span>
  ) : (
    <span className="rounded-full bg-neutral-200 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-neutral-500 dark:bg-neutral-700 dark:text-neutral-300">
      Closed
    </span>
  );
}

function CreateCampaignModal({ onClose }: { onClose: () => void }) {
  const [state, action, pending] = useActionState(
    createCampaign,
    createInitial,
  );

  // Close automatically once the campaign is created.
  useEffect(() => {
    if (state.status === "success") onClose();
  }, [state.status, onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-neutral-200 bg-white p-6 shadow-xl dark:border-neutral-800 dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-semibold text-foreground">
            Create Campaign
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-neutral-400 transition-colors hover:text-foreground"
          >
            <Icon name="close" className="text-[20px]" />
          </button>
        </div>

        <form action={action} className="mt-4 space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="campaign-name"
              className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400"
            >
              Name
            </label>
            <input
              id="campaign-name"
              name="name"
              required
              autoFocus
              placeholder="Recruitment 2027"
              className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-neutral-700 dark:bg-neutral-950"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              name="isOpen"
              value="true"
              defaultChecked
              className="size-4 rounded border-neutral-300 text-primary focus:ring-primary/30"
            />
            Open for applications
          </label>

          {state.status === "error" && (
            <p className="text-sm text-status-rejected">{state.message}</p>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-neutral-500 transition-colors hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {pending ? "Creating…" : "Create Campaign"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
