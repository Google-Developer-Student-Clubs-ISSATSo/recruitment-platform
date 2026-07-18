// Template keys and subjects for the two Phase 1 result emails. Kept in a plain
// module (not the "use server" actions file, whose exports must all be async)
// so both the selection page and the batch-send action agree on the exact
// strings. templateKey is what EmailLog rows are keyed by for duplicate-send
// prevention, so it must stay stable.

export const PHASE1_TEMPLATE = {
  ACCEPTANCE: "PHASE1_ACCEPTANCE",
  REJECTION: "PHASE1_REJECTION",
} as const;

// Subject lines match each source document's title EXACTLY (the "object" of the
// original Word docs). These are passed as the explicit `subject` argument at
// every sendTemplatedEmail call site — never defaulted or prefixed in the send
// pipeline — so each template keeps its own fixed subject.
export const PHASE1_SUBJECT = {
  ACCEPTANCE: "Acceptance in the First phase of joining GDGC-ISSATSO",
  REJECTION: "Response to joining GDGC-ISSATSO application",
} as const;
