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
import { StaggerGroup, StaggerItem } from "@/components/motion/stagger";
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
    <div className="mx-auto max-w-6xl space-y-6">
      {denied && (
        <div className="rounded-lg border border-status-rejected/30 bg-status-rejected/10 px-4 py-3 text-sm font-medium text-status-rejected">
          You don&apos;t have access to that page.
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Campaigns</h1>
          <p className="mt-1 max-w-2xl text-sm text-neutral-500 dark:text-neutral-400">
            Choose a recruitment campaign to work in. Everything else — the
            applicant pool, screening, interviews — is scoped to the campaign you
            pick.
          </p>
        </div>
        {canManage && (
          // w-full below sm so it doesn't end up as a lone stranded button on a
          // line of its own at 375px.
          <button
            onClick={() => setShowCreate(true)}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors duration-150 ease-out hover:bg-primary/90 motion-reduce:transition-none sm:w-auto"
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
        // A CARD GRID, not the dense table the Applicants page uses. There are
        // only ever a handful of campaigns and each one is a destination you
        // commit to for weeks, so every item earns real estate: its own surface,
        // its own metadata strip and its own actions. Two columns from sm, three
        // from xl, one below — the actions row needs ~300px before the Enter and
        // Open/Close buttons start crowding each other.
        <StaggerGroup as="ul" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {campaigns.map((c) => (
            <CampaignCard key={c.id} campaign={c} canManage={canManage} />
          ))}
        </StaggerGroup>
      )}

      {showCreate && <CreateCampaignModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}

/**
 * One campaign as a card: status and destructive action on the top row, the name
 * as the loudest thing on the card, a bordered metadata strip, then the actions
 * pinned to the bottom.
 *
 * Vertical rather than the old single-row layout because a row forces every
 * campaign to compete for one line of width — at 375px the old version wrapped
 * its four controls into a ragged stack. Here the shape is the same at every
 * width; only the number of columns in the grid changes.
 */
function CampaignCard({
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
    <StaggerItem
      as="li"
      className="group flex h-full flex-col rounded-xl border border-neutral-200 bg-white shadow-sm transition-[border-color,box-shadow,transform] duration-150 ease-out hover:border-primary/40 hover:shadow-md motion-reduce:transition-none sm:hover:-translate-y-0.5 motion-reduce:sm:hover:translate-y-0 dark:border-neutral-800 dark:bg-neutral-900"
    >
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <StatusBadge isOpen={campaign.isOpen} />
          {canManage && (
            // Always present, not hover-revealed: on a touch screen there is no
            // hover, and a delete you cannot find is worse than one that is
            // visible. It stays low-contrast until hovered instead.
            <button
              onClick={() => setConfirmingDelete(true)}
              aria-label={`Delete ${campaign.name}`}
              title="Delete campaign"
              className="-mr-1 -mt-1 flex shrink-0 items-center rounded-lg p-1.5 text-neutral-400 transition-colors duration-150 ease-out hover:bg-status-rejected/10 hover:text-status-rejected motion-reduce:transition-none"
            >
              <Icon name="delete" className="text-[18px]" />
            </button>
          )}
        </div>

        <h2 className="mt-3 text-lg font-semibold text-balance text-foreground">
          {campaign.name}
        </h2>

        {/* The two facts that decide whether this is the campaign you want,
            given the weight of a bordered strip rather than a muted one-liner. */}
        <dl className="mt-4 grid grid-cols-2 gap-3 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
          <div className="min-w-0">
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              Applicants
            </dt>
            <dd className="truncate text-xl font-bold tabular-nums text-foreground">
              {campaign.applicantCount}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              Created
            </dt>
            <dd className="truncate text-sm font-medium text-foreground">
              {date}
            </dd>
          </div>
        </dl>

        {statusError && (
          <p className="mt-3 text-xs text-status-rejected">{statusError}</p>
        )}
      </div>

      {/* mt-auto via flex-1 above keeps this row on the bottom edge, so the
          Enter buttons line up across cards of differing name lengths. */}
      <div className="flex items-center gap-2 border-t border-neutral-200 p-4 dark:border-neutral-800">
        <Link
          href={`/campaigns/${campaign.id}/dashboard`}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-primary px-4 py-2 text-sm font-semibold text-primary transition-colors duration-150 ease-out hover:bg-primary/10 motion-reduce:transition-none"
        >
          Enter
          <Icon
            name="arrow_forward"
            className="text-[18px] transition-transform duration-150 ease-out group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
          />
        </Link>
        {canManage && (
          <button
            onClick={() => setConfirmingStatus(true)}
            disabled={pending}
            aria-label={`${willOpen ? "Open" : "Close"} ${campaign.name}`}
            title={willOpen ? "Re-open campaign" : "Close campaign"}
            className="flex shrink-0 items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-500 transition-colors duration-150 ease-out hover:bg-neutral-100 hover:text-foreground disabled:opacity-50 motion-reduce:transition-none dark:border-neutral-800 dark:hover:bg-neutral-800"
          >
            <Icon
              name={willOpen ? "lock_open" : "lock"}
              className="text-[18px]"
            />
            {willOpen ? "Open" : "Close"}
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
    </StaggerItem>
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
