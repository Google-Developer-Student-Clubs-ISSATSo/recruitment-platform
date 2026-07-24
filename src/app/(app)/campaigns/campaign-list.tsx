"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import Link from "next/link";

import { Icon } from "@/components/app-shell/icon";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { splitTimestamp } from "@/lib/activity-descriptions";
import {
  createCampaign,
  deleteCampaign,
  setCampaignStatus,
  type CreateCampaignState,
} from "./actions";

export type CampaignCard = {
  id: string;
  name: string;
  isOpen: boolean;
  createdAtISO: string;
  applicantCount: number;
};

const createInitial: CreateCampaignState = { status: "idle" };

export function CampaignList({
  campaigns,
  canManage,
  denied,
}: {
  campaigns: CampaignCard[];
  /**
   * MANAGE_CAMPAIGNS/ACCOUNTS — gates both creating and deleting campaigns, which
   * sit behind the same permission set. Server-enforced in actions.ts too; this
   * only decides whether the controls are rendered.
   */
  canManage: boolean;
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
        {canManage && (
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
            <CampaignRow key={c.id} campaign={c} canManage={canManage} />
          ))}
        </ul>
      )}

      {showCreate && <CreateCampaignModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}

function CampaignRow({
  campaign,
  canManage,
}: {
  campaign: CampaignCard;
  canManage: boolean;
}) {
  const { date } = splitTimestamp(campaign.createdAtISO);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingStatus, setConfirmingStatus] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const willOpen = !campaign.isOpen;

  function toggleStatus() {
    setStatusError(null);
    startTransition(async () => {
      const res = await setCampaignStatus(campaign.id, willOpen);
      if (!res.ok) setStatusError(res.error);
    });
  }

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
          Created {date} · {campaign.applicantCount} applicant
          {campaign.applicantCount === 1 ? "" : "s"}
        </p>
        {statusError && (
          <p className="mt-1 text-xs text-status-rejected">{statusError}</p>
        )}
      </div>
      <div className="flex items-center gap-2">
        {canManage && (
          <button
            onClick={() => setConfirmingStatus(true)}
            disabled={pending}
            aria-label={`${willOpen ? "Open" : "Close"} ${campaign.name}`}
            title={willOpen ? "Re-open campaign" : "Close campaign"}
            className="flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-foreground disabled:opacity-50 dark:border-neutral-800 dark:hover:bg-neutral-800"
          >
            <Icon
              name={willOpen ? "lock_open" : "lock"}
              className="text-[18px]"
            />
            {willOpen ? "Open" : "Close"}
          </button>
        )}
        <Link
          href={`/campaigns/${campaign.id}/dashboard`}
          className="flex items-center gap-2 rounded-lg border border-primary px-4 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/10"
        >
          Enter
          <Icon name="arrow_forward" className="text-[18px]" />
        </Link>
        {canManage && (
          <button
            onClick={() => setConfirmingDelete(true)}
            aria-label={`Delete ${campaign.name}`}
            title="Delete campaign"
            className="flex items-center rounded-lg border border-neutral-200 p-2 text-neutral-400 transition-colors hover:border-status-rejected/40 hover:bg-status-rejected/10 hover:text-status-rejected dark:border-neutral-800"
          >
            <Icon name="delete" className="text-[18px]" />
          </button>
        )}
      </div>

      {canManage && (
        <>
          <ConfirmDialog
            open={confirmingStatus}
            onOpenChange={setConfirmingStatus}
            title={willOpen ? `Re-open “${campaign.name}”?` : `Close “${campaign.name}”?`}
            description={
              willOpen ? (
                <>
                  This re-opens the campaign so anyone with a campaign-scoped
                  permission can enter and work in it again.
                </>
              ) : (
                <>
                  Closing archives the campaign. After this, only members with{" "}
                  <strong>View Campaign History</strong> (or Manage Accounts) can
                  enter it — everyone else loses access. You can re-open it later.
                </>
              )
            }
            confirmLabel={willOpen ? "Re-open campaign" : "Close campaign"}
            destructive={!willOpen}
            onConfirm={toggleStatus}
          />
          <DeleteCampaignDialog
            campaign={campaign}
            open={confirmingDelete}
            onOpenChange={setConfirmingDelete}
          />
        </>
      )}
    </li>
  );
}

/**
 * Type-to-confirm delete, in the GitHub repo-deletion mould: the destructive
 * button stays disabled until the typed text matches the campaign name exactly.
 * Deleting a campaign discards the entire applicant pool and every score,
 * result and email log attached to it — potentially weeks of a recruitment
 * cycle — so a single "Are you sure?" click is too weak a gate. The same name
 * check is repeated server-side in {@link deleteCampaign}.
 */
function DeleteCampaignDialog({
  campaign,
  open,
  onOpenChange,
}: {
  campaign: CampaignCard;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Every close routes through here — Cancel, Escape, backdrop, and a completed
  // delete — so a half-typed name or stale error can never survive into the next
  // opening. Done on the transition rather than in an effect keyed on `open`,
  // which would set state during render.
  function handleOpenChange(next: boolean) {
    if (!next) {
      setTyped("");
      setError(null);
    }
    onOpenChange(next);
  }

  const matches = typed === campaign.name;

  function confirmDelete() {
    if (!matches) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteCampaign(campaign.id, typed);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      handleOpenChange(false);
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{campaign.name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently deletes the campaign and everything in it. It cannot
            be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3 text-left">
          <ul className="space-y-1 rounded-lg border border-status-rejected/30 bg-status-rejected/10 p-3 text-sm text-status-rejected">
            <li>
              <strong>{campaign.applicantCount}</strong> applicant
              {campaign.applicantCount === 1 ? "" : "s"} and all their
              application data
            </li>
            <li>Every Phase 1 score, ranking and result</li>
            <li>The scoring questions and configuration</li>
            <li>The record of which result emails were sent</li>
          </ul>

          <div className="space-y-1.5">
            <label
              htmlFor={`confirm-${campaign.id}`}
              className="block text-sm text-muted-foreground"
            >
              Type <strong className="text-foreground">{campaign.name}</strong>{" "}
              to confirm:
            </label>
            <input
              id={`confirm-${campaign.id}`}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-foreground outline-none focus:border-status-rejected focus:ring-2 focus:ring-status-rejected/20 dark:border-neutral-700 dark:bg-neutral-950"
            />
          </div>

          {error && <p className="text-sm text-status-rejected">{error}</p>}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={!matches || pending}
            onClick={confirmDelete}
          >
            {pending ? "Deleting…" : "Delete campaign"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
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

  // Built on the same AlertDialog primitives as every other modal in the app,
  // rather than a hand-rolled overlay: that keeps the radius, surface, overlay
  // treatment, footer rhythm and button tokens identical to the confirm dialogs
  // without restating any of them here.
  return (
    <AlertDialog open onOpenChange={(next) => !next && onClose()}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Create Campaign</AlertDialogTitle>
          <AlertDialogDescription>
            Everything — applicants, screening, interviews — is scoped to the
            campaign you create here.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <form action={action} className="space-y-4 text-left">
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

          <AlertDialogFooter>
            <AlertDialogCancel type="button" disabled={pending}>
              Cancel
            </AlertDialogCancel>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create Campaign"}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
