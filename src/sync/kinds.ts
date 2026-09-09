export const SYNC_KINDS = ["pr-authored", "pr-reviewed", "issue", "contributions"] as const;

export type SyncKind = (typeof SYNC_KINDS)[number];

export function isSyncKind(value: string): value is SyncKind {
  return SYNC_KINDS.some((kind) => kind === value);
}

// Spelling the keys out is what lets the compiler check them: a kind added to
// SYNC_KINDS widens SyncKind, and this record fails to satisfy its own return
// type until it gains the key too.
export function byKind<Value>(value: (kind: SyncKind) => Value): Record<SyncKind, Value> {
  return {
    "pr-authored": value("pr-authored"),
    "pr-reviewed": value("pr-reviewed"),
    issue: value("issue"),
    contributions: value("contributions"),
  };
}
