# Phase 2 breakdown: TUI & commands

The Phase 2 plan is `implementation-process.md` §4, items 5–8: Ink TUI shell, slash commands,
state store, `@file` tagging. That's four non-trivial subsystems bundled into one phase, which is
why it feels large.

## Reordering: Ink moves from first to last

The source doc lists the Ink TUI as item 5 (first). This breakdown builds it as step **2.5
(last)** instead. That's a deliberate reorder, not a disagreement — it's the same "loop before UI"
principle §5 of `implementation-process.md` already uses to justify Phase 1's readline CLI: prove
the logic against a boring, scriptable interface before sinking time into a UI that's hard to
verify without a human watching. State store, commands, and `@file` tagging all get built and
tested against the existing Phase 1 readline CLI; Ink is added last as a rendering layer over
already-correct logic. `implementation-process.md` §4 has been updated to point here so there's
one live plan, not two.

## 2.1 — State store core (no CLI/TUI involved)

Build `src/state/`:
- `types.ts` — a `TranscriptRecord` type, **distinct from** `ChatMessage` (the provider-facing
  type from Phase 1). A transcript record carries persistence concerns a `ChatMessage` doesn't:
  `id`, `sessionId`, `parentSessionId` (empty for now — populated in Phase 4), `timestamp`, and a
  `type: "message" | "summary"` discriminator (`"summary"` is unused until Phase 5's `/compact`,
  but the field must exist now so compaction doesn't force a migration later). A `"message"`
  record embeds the same fields as `ChatMessage` (role, content, toolCalls, toolCallId, toolName).
- `store.ts` — `appendRecord(sessionId, record)`, `readSession(sessionId): TranscriptRecord[]`,
  `listSessions(projectKey): {id, startedAt, firstUserMessage}[]`, `newSessionId()`.
- `mapping.ts` — `toChatMessage(record)` / `fromChatMessage(sessionId, msg)` conversions. The loop
  never sees `TranscriptRecord` directly; it only ever deals in `ChatMessage[]`, produced by
  mapping a session's records through `toChatMessage`.

**Concrete decisions (so 2.3 doesn't stall on them later):**
- `project-key` = the cwd path with `/` replaced by `-` (e.g. `/home/midsane/bubble-tea` →
  `-home-midsane-bubble-tea`) — greppable/debuggable on disk, no hashing.
- Path: `~/.bubbletea/sessions/<project-key>/<session-id>.jsonl`, one JSON object per line.
- Session list metadata (for the future `/session` list view) comes from reading each session
  file's first `"message"` record — no separate index file. Fine at this scale; revisit only if
  the number of sessions per project gets large enough that scanning all files is slow.

**Exit criteria:** a standalone script creates a session, appends N records via `appendRecord`,
then calls `readSession` + `toChatMessage` and gets back the exact `ChatMessage[]` that produced
those records — a round-trip test with no CLI or TUI involved.

## 2.2 — Wire the state store into the Phase 1 loop

Modify `src/cli.ts`: every message pushed to the in-memory `messages` array is also appended to
the current session's transcript via `fromChatMessage` + `appendRecord`. Add a `--resume` CLI flag
(not `/session` — that's 2.3, and 2.2 should be verifiable without a command router yet): with the
flag, load the most recent session for this `project-key` via `listSessions` + `readSession` and
rebuild `messages` from it before the REPL starts; without it, start a fresh session id.

**Exit criteria:** run the CLI, have a short conversation, exit. Rerun with `--resume` — the loop
continues with the correct prior history, and the transcript file on disk contains exactly the
records the conversation produced (checked directly, not just via replay — catches encoding bugs
replay alone would hide).

## 2.3 — Slash command router

Build `src/commands/`: a registry mapping command name → handler, and a parser that intercepts
input starting with `/` before it reaches the model loop.

Implement, in order: `/help` (list registered commands — trivial, proves the router works),
`/new` (start a new session id, clear in-memory `messages`, keep the process running), `/session`
(list sessions for this `project-key` via 2.1's `listSessions`, and `/session <id>` to switch —
this is what makes 2.2's `--resume` flag obsolete for interactive use, though the flag stays for
non-interactive/scripted resume).

**Exit criteria:** `/new` mid-conversation starts a fresh transcript file and clears history;
`/session` lists prior sessions with a timestamp and first-message preview; `/session <id>` resumes
one and the next model call has the correct restored history.

## 2.4 — `@file` tagging

A mention scanner (`src/commands/mentions.ts` or similar) that finds `@path` tokens in raw user
input, resolves each path relative to cwd, and reads the file (reuse the `read_file` tool's
read+truncate logic rather than duplicating it).

**Injection format, decided now so it doesn't drift between the readline and Ink paths:** file
contents are **appended as fenced blocks after the user's original text**, one per mention, each
labeled with its path — not substituted inline for the `@path` token. Inline substitution breaks
down with multiple mentions or paths containing `@`-like text; appending is simpler and keeps the
user's literal message intact in the transcript.

**Exit criteria:** `summarize @package.json` results in the model receiving the file's actual
contents in context, without the user pasting it manually; `@nonexistent-file` degrades to an
inline error notice in the appended block instead of throwing and aborting the turn.

## 2.5 — Ink TUI shell (rendering layer only)

Build `src/tui/`: `App.tsx`, `MessageStream.tsx`, `InputBox.tsx`, `StatusBar.tsx`. By this point
2.1–2.4 are already correct and tested against the readline CLI, so this step is purely a
rendering/input-plumbing swap: `InputBox` captures a line and hands it to the *same*
command-router + `@file` scanner + loop + state-store functions already validated — no new logic.
`MessageStream` replays the current session on startup via 2.1's `readSession` +
`toChatMessage`, the same path `--resume` and `/session` already exercise.

**Exit criteria (matches the original Phase 2 exit criterion in `implementation-process.md`):** a
session can be closed and resumed via `/session`, with the Ink TUI replaying prior messages from
the JSONL transcript exactly — but by now this is a UI-correctness check only, since the
underlying logic was already proven in 2.1–2.4.

## Why this order

- **2.1 before everything** — every other step reads or writes transcripts; get the schema right
  once (record id, `parentSessionId`, summary/supersede type) rather than retrofitting it under
  2.5's UI pressure.
- **2.2 before 2.3** — proves persistence works before adding a command layer on top of it.
- **2.3 before 2.4** — `@file` tagging is independent of commands, but ordering it after means the
  input-parsing pipeline (commands, then mentions) is established once and TUI just calls into it.
- **2.5 last** — the one step that can't be verified by a script; doing it last means a stall here
  doesn't block anything else, and everything it renders is already known-correct.
