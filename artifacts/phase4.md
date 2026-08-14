## 4. Recommended build order (5 phases)

The guiding principle, straight from the Claude Code build-order research: **get one thin,
working loop end-to-end before adding any safety, UI polish, or extensibility.** Every phase after
Phase 1 wraps the same loop; nothing in Phase 1 should have to be rewritten later.

### Phase 1 — Core skeleton (prove the loop works)
1. Project scaffold (TS project, CLI bin entry, build/dev scripts).
2. Provider abstraction: one internal `Provider` interface (`chat()`, `stream()`, tool-call
   parsing) with an OpenRouter adapter first (OpenAI-compatible REST — least friction), then a
   Gemini adapter (`@google/genai`, native function calling).
3. Minimal tool registry with 3–4 built-ins: `read_file`, `write_file`, `bash`, `list_dir`.
4. Core execution loop: single-threaded plan→act→observe cycle against a plain readline CLI (no
   TUI yet) — this is the fastest way to validate provider + tools + loop together before
   investing in rendering.

### Phase 2 — TUI & commands (make it feel like Claude Code)

> Superseded by [`phase2-breakdown.md`](phase2-breakdown.md), which reorders item 5 (Ink) to run
> last as step 2.5 instead of first — same "loop before UI" rationale as Phase 1, applied one
> level deeper. Follow the breakdown doc's step order (2.1–2.5) when implementing; the items below
> are the original unordered scope.

5. Ink-based TUI shell replacing the readline CLI: message stream, input box, streaming output,
   status/spinner. Ink is the right choice here — it's the same library Claude Code, Gemini CLI,
   and GitHub Copilot CLI are built on, gives React-style component composition, Flexbox layout
   via yoga-layout, and a mature ecosystem (`ink-select-input`, `ink-progress-bar`, InkUI
   component kit).
6. Slash command framework: `/help`, `/new`.
7. State store: append-only JSONL transcripts per session, `/session` to list/switch/resume.
   (Append-only files, not a database — matches Claude Code's own pattern and keeps sessions
   auditable/diffable without a DB dependency.) Design the record schema for what later phases
   need, even though those phases aren't built yet: every record gets a stable id and a
   `parentSessionId` field (empty for top-level sessions, set for sub-agent sidechains — Phase 4),
   plus a `summary`/`supersede` record type that can replace a range of prior records by id
   (Phase 5 compaction). Getting this schema right now avoids a transcript migration later.
8. `@file` tagging: parse mentions, inject file contents into context.

**Exit criteria — Phase 1:** a real model response drives a `write_file` tool call and the target
file changes on disk, observed end-to-end through the readline CLI.
**Exit criteria — Phase 2:** a session can be closed and resumed via `/session`, with the Ink TUI
replaying prior messages from the JSONL transcript exactly.
