"use client";

import { useState, useTransition } from "react";

import { Icon } from "@/components/app-shell/icon";
import { ConfirmDialog } from "@/components/confirm-dialog";

import { deleteAllLogs, deleteCampaignLogs } from "./actions";
import {
  DELETE_ALL_LOGS_PHRASE,
  DELETE_CAMPAIGN_LOGS_PHRASE,
} from "./delete-log-phrases";

type Mode = "campaign" | "all";

/**
 * The Administrator's log-deletion controls. Rendered only when the server has
 * confirmed MANAGE_ACCOUNTS — the actions re-check it themselves, so this is
 * presentation, not the gate.
 *
 * The campaign-scoped delete deliberately has no campaign picker of its own: it
 * acts on whatever the page's existing campaign filter is set to, so you can
 * only clear a scope you are currently looking at.
 */
export function DeleteLogsControls({
  selectedCampaign,
}: {
  /** The campaign the filter bar is currently set to, if any. */
  selectedCampaign: { id: string; name: string } | null;
}) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function close() {
    setMode(null);
    setError(null);
  }

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await action();
      if (!res.ok) {
        setError(res.error ?? "That didn't work.");
        return;
      }
      close();
    });
  }

  return (
    <>
      <button
        type="button"
        disabled={!selectedCampaign}
        onClick={() => {
          setError(null);
          setMode("campaign");
        }}
        title={
          selectedCampaign
            ? `Delete the log entries for ${selectedCampaign.name}`
            : "Filter the log to a campaign first"
        }
        className="flex items-center gap-2 rounded-lg border border-status-rejected/30 px-4 py-2 text-sm font-semibold text-status-rejected transition-colors hover:bg-status-rejected/10 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Icon name="delete" className="text-[18px]" />
        Delete campaign logs
      </button>

      <button
        type="button"
        onClick={() => {
          setError(null);
          setMode("all");
        }}
        className="flex items-center gap-2 rounded-lg bg-status-rejected px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-status-rejected/90"
      >
        <Icon name="delete" className="text-[18px]" />
        Delete all logs
      </button>

      {selectedCampaign && (
        <ConfirmDialog
          open={mode === "campaign"}
          onOpenChange={(next) => (next ? setMode("campaign") : close())}
          title={`Delete every log entry for “${selectedCampaign.name}”?`}
          description="This permanently removes that campaign's audit history. Other campaigns' entries and all global entries are left alone. It cannot be undone."
          confirmLabel={pending ? "Deleting…" : "Delete these entries"}
          destructive
          confirmPhrase={DELETE_CAMPAIGN_LOGS_PHRASE}
          error={error}
          pending={pending}
          onConfirm={() =>
            run(() =>
              deleteCampaignLogs(
                selectedCampaign.id,
                DELETE_CAMPAIGN_LOGS_PHRASE,
              ),
            )
          }
        >
          <p className="rounded-lg border border-status-rejected/30 bg-status-rejected/10 p-3 text-sm text-status-rejected">
            The deletion itself is recorded as a global entry, so the log keeps a
            trace of who cleared it and when.
          </p>
        </ConfirmDialog>
      )}

      <ConfirmDialog
        open={mode === "all"}
        onOpenChange={(next) => (next ? setMode("all") : close())}
        title="Delete the entire activity log?"
        description="This permanently removes every entry for every campaign, plus every global entry. It cannot be undone."
        confirmLabel={pending ? "Deleting…" : "Delete everything"}
        destructive
        confirmPhrase={DELETE_ALL_LOGS_PHRASE}
        error={error}
        pending={pending}
        onConfirm={() => run(() => deleteAllLogs(DELETE_ALL_LOGS_PHRASE))}
      >
        <p className="rounded-lg border border-status-rejected/30 bg-status-rejected/10 p-3 text-sm text-status-rejected">
          Unlike a campaign purge, this leaves <strong>nothing</strong> behind in
          the log — the table cannot record its own wipe. The only surviving
          record is a line in the server logs.
        </p>
      </ConfirmDialog>
    </>
  );
}
