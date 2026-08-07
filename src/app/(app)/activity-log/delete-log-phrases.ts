/**
 * The phrases an Administrator must type back to delete activity-log history.
 *
 * They live here rather than beside the actions because a `"use server"` module
 * may only export async functions — and both sides need them: the dialog gates
 * its button on them, and the actions re-check them server-side, since a server
 * action is reachable by POST regardless of what the UI rendered.
 */
export const DELETE_CAMPAIGN_LOGS_PHRASE = "DELETE LOGS";
export const DELETE_ALL_LOGS_PHRASE = "DELETE ALL LOGS";
