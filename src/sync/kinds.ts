import type { EventKind } from "../github/windows";

// The three search kinds come from the extraction client's own union, so a kind
// added there breaks byKind below until this module covers it too.
export type SyncKind = EventKind | "contributions";

// The kinds the search connection answers for, which is every kind but the
// contributions collection.
export const SEARCH_KINDS = [
  "pr-authored",
  "pr-reviewed",
  "issue",
] as const satisfies readonly EventKind[];

export const SYNC_KINDS = [
  "pr-authored",
  "pr-reviewed",
  "issue",
  "contributions",
] as const satisfies readonly SyncKind[];

// Spelling the keys out is what lets the compiler check them: a record missing
// one fails to satisfy its own return type.
export function byKind<Value>(value: (kind: SyncKind) => Value): Record<SyncKind, Value> {
  return {
    "pr-authored": value("pr-authored"),
    "pr-reviewed": value("pr-reviewed"),
    issue: value("issue"),
    contributions: value("contributions"),
  };
}
