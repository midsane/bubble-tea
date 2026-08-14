# 05 — State and sessions

## Why `TranscriptRecord` is not `ChatMessage`

`ChatMessage` (`src/providers/types.ts`) is what a provider sends and receives — no identity, no
timestamp, no notion of a session. Persisting the raw wire format would work, but it can't express
things the *harness* needs: which session a record belongs to, whether it belongs to a sub-agent's
isolated sidechain, or that a later summary has replaced it. So there's a second, distinct type:

```ts
// src/state/types.ts
export type TranscriptRecord = MessageRecord | SummaryRecord;

export interface MessageRecord {
  type: "message";
  id: string;
  sessionId: string;
  parentSessionId: string;  // empty for a top-level session, set for a sub-agent sidechain
  timestamp: string;
  role: Role;
  content: string | null;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  toolName?: string;
}

export interface SummaryRecord {
  type: "summary";
  id: string;
  sessionId: string;
  parentSessionId: string;
  timestamp: string;
  supersedes: string[];  // ids of the MessageRecords this summary replaces
  content: string;
}
```

The `type` discriminator and `parentSessionId`/`supersedes` fields exist from the very first
version of this schema, even though nothing used `"summary"` or non-empty `parentSessionId` until
later features were built — getting the schema right once avoids a transcript migration.
`src/state/mapping.ts` converts between the two: `fromChatMessage` (persist) and `toChatMessage` /
`resolveSession` (read back).

## On-disk format

One JSON object per line, appended (never rewritten), at
`~/.bubbletea/sessions/<projectKey>/<sessionId>.jsonl` (`sessionsDir()` in `src/config/paths.ts`).
`projectKey()` is `process.cwd()` with every `/` replaced by `-` — greppable and debuggable
directly on disk, no hashing, no lookup table. This also means **sessions are scoped per exact
working directory**: running bubble-tea from a subdirectory of the same project is a *different*
session namespace, by design.

```ts
// src/state/store.ts
export async function appendRecord(
  projectKey: string,
  sessionId: string,
  record: TranscriptRecord
): Promise<void> {
  const dir = sessionsDir(projectKey);
  await mkdir(dir, { recursive: true });
  await appendFile(sessionFile(projectKey, sessionId), `${JSON.stringify(record)}\n`, "utf-8");
}
```

Append-only JSONL instead of a database: every write is one syscall-simple operation, the file is
`cat`-able and `jq`-able for debugging, and there's no schema migration tooling to build for a
project this size. See
[pre-req/05-filesystem-jsonl-and-config-dirs.md](../pre-req/05-filesystem-jsonl-and-config-dirs.md)
for why append-only avoids the corruption risk a rewrite-in-place JSON blob would carry.

`listSessions` reads every `.jsonl` file in a project's directory and pulls `startedAt` (the first
record's timestamp) and a `firstUserMessage` preview from each — there's no separate index file,
which is fine at this scale (one project's session count) and would need revisiting only if that
stopped being true.

## Resolving a session: `resolveSession`

The raw JSONL log is not what the loop should see — records superseded by a later `SummaryRecord`
need to disappear, and the summary needs to appear *where the turns it covers used to be*, not at
its own (later) append position:

```ts
// src/state/mapping.ts
export function resolveSession(records: TranscriptRecord[]): ChatMessage[] {
  const superseded = new Set<string>();
  for (const r of records) if (r.type === "summary") for (const id of r.supersedes) superseded.add(id);

  const entries: { key: number; message: ChatMessage }[] = [];
  records.forEach((r, i) => {
    if (r.type === "summary") {
      const anchors = r.supersedes.map((id) => indexById.get(id)).filter((n): n is number => n !== undefined);
      const anchor = anchors.length > 0 ? Math.min(...anchors) : i;
      entries.push({ key: anchor - 0.5, message: toChatMessage(r) });  // sorts just before its earliest superseded record
      return;
    }
    if (superseded.has(r.id)) return;  // dropped — folded into a summary
    entries.push({ key: i, message: toChatMessage(r) });
  });

  entries.sort((a, b) => a.key - b.key);
  return entries.map((e) => e.message);
}
```

The `anchor - 0.5` trick is what places a summary correctly: sorting by a fractional key just below
its earliest superseded record's index guarantees the summary lands before any record it replaces
and before any newer, still-active turn — without needing to track separate insertion logic. Every
command that switches sessions (`/session`, `/new`, resuming via `--resume`) goes through this
function, never the raw record list directly.

## Compaction: folding old turns into one summary

```ts
// src/loop/compact.ts — picking the boundary
export function buildCompactionPlan(records: TranscriptRecord[], keepRecentTurns = 3): CompactionPlan | null {
  const userIndices = /* indices of every user-role message record */;
  if (userIndices.length <= keepRecentTurns) return null;
  const boundary = userIndices[userIndices.length - keepRecentTurns];
  const toSummarize = records.slice(1, boundary).filter(/* messages only */);  // never touches index 0 (system prompt)
  return toSummarize.length > 0 ? { toSummarize } : null;
}
```

The boundary always lands **right before a user message** — a fresh user turn can only start once
the prior turn's tool-call loop has fully resolved, so cutting there can never split an
assistant-with-toolCalls record from the tool-result records that answer it (both `ChatMessage` and
every provider's wire format reject that pairing being separated).

```ts
// src/state/compact.ts — applying the plan
export async function compactSession(provider, projectKey, sessionId, keepRecentTurns?) {
  const active = /* records not already superseded */;
  const plan = buildCompactionPlan(active, keepRecentTurns);
  if (!plan) return null;
  const content = await summarizeRecords(provider, plan.toSummarize);  // one extra LLM call, no tools
  const summary: SummaryRecord = { type: "summary", ..., supersedes: plan.toSummarize.map((r) => r.id), content };
  await appendRecord(projectKey, sessionId, summary);
  return { messages: resolveSession(await readSession(projectKey, sessionId)), summarizedCount: plan.toSummarize.length };
}
```

`summarizeRecords` sends the excerpt to the model with a one-shot system prompt ("what was asked,
what was done, what's still open") and no tools — it's a plain `provider.chat()` call, not a
`runTurn`. The old records are never deleted from the `.jsonl` file; the summary is appended as a
*new* record that supersedes them. This is what makes compaction auditable: you can always read the
full original transcript on disk even after the live session has compacted past it.

`/compact` (a command — see [07-commands-and-mentions.md](07-commands-and-mentions.md)) calls this
manually; `App.tsx` also calls it automatically once `estimateTokens(messages) >
AUTO_COMPACT_TOKEN_THRESHOLD` after a turn completes (see
[01-end-to-end-turn.md](01-end-to-end-turn.md) step 7).
