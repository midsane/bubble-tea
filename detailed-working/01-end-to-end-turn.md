# 01 — One turn, traced end-to-end

Everything else in this folder documents a single layer in isolation. This file instead follows
one concrete user turn through the whole system, so you can see how the layers actually compose.
Scenario: the user types `summarize @package.json` in the TUI.

## 1. Keystroke → submit

`InputBox` (`src/tui/InputBox.tsx`) owns the raw text as local state and calls `onSubmit(value)`
when Enter is pressed (via `ink-text-input`'s `onSubmit`). That handler is `App`'s `handleSubmit`
(`src/tui/App.tsx`). Along the way, while the user was typing, `InputBox` was also computing
live command/mention hints — see [06-tui.md](06-tui.md) — but none of that affects submission
itself.

## 2. Triage: exit words → agent mentions → slash commands → plain turn

`handleSubmit` checks the input in a fixed order:

```ts
if (trimmed === "exit" || trimmed === "quit") { exit(); process.exit(0); return; }

if (trimmed.includes("@")) {
  const match = findAgentMention(trimmed, agents);
  if (match) { /* spawn a background sub-agent run, return — see file 09 */ }
}

const parsed = parseCommand(trimmed);
if (parsed) { /* dispatch to the command registry, return — see file 07 */ }

// otherwise: a plain conversational turn, continues below
```

`summarize @package.json` doesn't match a bare exit word, doesn't name a known agent (the `@` here
is a file mention, not `@plan-agent`), and doesn't start with `/`. It falls through to the plain
turn path.

## 3. Mention expansion

```ts
const expanded = await expandMentions(trimmed, skills);
messagesRef.current.push({ role: "user", content: expanded });
```

`expandMentions` (`src/commands/mentions.ts`) finds every `@token` in the raw text via regex,
resolves each one against the loaded skills first (exact name match), and falls back to treating it
as a file path otherwise. It does **not** substitute the mention inline — it appends a fenced block
after the original text, once per mention:

```ts
export async function expandMentions(input: string, skills: SkillDefinition[] = []): Promise<string> {
  const tokens = [...input.matchAll(MENTION_PATTERN)].map((m) => m[1]);
  if (tokens.length === 0) return input;
  const skillByName = new Map(skills.map((s) => [s.name, s]));
  const blocks = await Promise.all(tokens.map((t) => renderMentionBlock(t, skillByName)));
  return `${input}\n\n${blocks.join("\n\n")}`;
}
```

So `"summarize @package.json"` becomes something like:

```
summarize @package.json

@package.json:
```
{ "name": "bubble-tea", ... }
```
```

If `package.json` doesn't exist or can't be read, `renderFileBlock` catches the error and inlines
`@package.json: [error reading file: ...]` instead of throwing — a bad mention degrades the turn,
it doesn't abort it.

This expanded string — not the raw `trimmed` text — is what gets pushed onto `messagesRef.current`
as the user message the model actually sees. The *unexpanded* `trimmed` text is what gets rendered
in the TUI (`setHistory((h) => [...h, { key: ..., role: "user", text: trimmed }])`) — the user
should see what they typed, not the injected file contents cluttering the transcript view.

## 4. The loop takes over

```ts
await runTurn(provider, registry, messagesRef.current, hooks, undefined, setStreamingText);
```

`runTurn` (`src/loop/index.ts`) is the plan→act→observe cycle — full detail in
[04-execution-loop-and-hooks.md](04-execution-loop-and-hooks.md). Summary of this turn's path
through it:

1. Calls `provider.stream(messages, tools)`. Each `"delta"` event carries the *running total* of
   text so far for this call, so `onProgress` (here, `setStreamingText`) can just render the latest
   event — no accumulation needed on the caller's side.
2. If the model responds with tool calls (e.g. it decides no tool is needed and just answers, which
   is the likely outcome for a summarization ask), the loop pushes the assistant message and
   returns the final text immediately.
3. If the model *does* call a tool, each call passes through `evaluatePreToolUse` (a hook check —
   see file 04) before `registry.execute(name, args)` runs it, and the raw output passes through
   `applyPostToolUse` before being appended as a `role: "tool"` message. The loop then starts a new
   `provider.stream()` call with the tool results in context, and repeats — up to
   `MAX_ITERATIONS = 25` times.

For this scenario, the file contents are already in context via mention expansion, so the model
most likely just answers directly without calling any tool.

## 5. Rendering what happened

```ts
const produced = messagesRef.current.slice(startIndex + 1);
setHistory((h) => [...h, ...messagesToDisplay(produced)]);
```

`messagesToDisplay` (`src/tui/display.ts`) turns the raw `ChatMessage[]` the loop produced into
`DisplayItem[]`: system messages are dropped, an assistant message with tool calls renders each
call as a `→ toolName(args)` line before its text, and tool-result messages render as `← output`.
Eval-retry synthetic user messages (prefixed with the internal `EVAL_FEEDBACK_MARKER`) are detected
and rendered as a `[eval retry]` notice instead of a real `you>` line — see file 11.

## 6. Persistence

```ts
await appendMessages(projectKey, sessionIdRef.current, messagesRef.current.slice(persistedCountRef.current));
persistedCountRef.current = messagesRef.current.length;
```

Only the *new* messages since the last persisted point are appended — `persistedCountRef` tracks
how far the in-memory array has already been written to disk. `appendMessages` converts each
`ChatMessage` to a `MessageRecord` (adds `id`, `sessionId`, `timestamp`) and appends one JSON line
per message to `~/.bubbletea/sessions/<projectKey>/<sessionId>.jsonl`. Full detail in
[05-state-and-sessions.md](05-state-and-sessions.md).

## 7. Auto-compaction check

```ts
if (estimateTokens(messagesRef.current) > AUTO_COMPACT_TOKEN_THRESHOLD) {
  const outcome = await compactSession(provider, projectKey, sessionIdRef.current);
  ...
}
```

`estimateTokens` is a `chars / 4` heuristic — "good enough to trigger compaction, not for billing"
per its own doc comment. `AUTO_COMPACT_TOKEN_THRESHOLD` is `6_000`, deliberately low so
auto-compaction is easy to trigger and observe in a demo session — it is not a tuned real-world
context budget. If crossed, `compactSession` folds every message before the last few user turns
into one LLM-generated summary record, appends *that* as a new record (never deleting the originals
— they're marked superseded, not erased), and the in-memory `messages` array is swapped for the
resolved (post-compaction) view.

## The whole path, as one list

```
keystroke
  → InputBox.onSubmit
  → App.handleSubmit
      (exit-word check, agent-mention check, slash-command check — all miss)
  → expandMentions            (commands/mentions.ts)
  → messagesRef.current.push  (raw ChatMessage[])
  → runTurn                   (loop/index.ts)
      → provider.stream()     (providers/openrouter.ts or gemini.ts)
      → evaluatePreToolUse    (hooks/pipeline.ts)   [only if the model calls a tool]
      → registry.execute()    (tools/registry.ts)
      → applyPostToolUse      (hooks/pipeline.ts)
      → (repeat until no more tool calls, or MAX_ITERATIONS)
  → messagesToDisplay          (tui/display.ts)  → setHistory (re-render)
  → appendMessages             (state/store.ts)  → JSONL on disk
  → estimateTokens / compactSession   (loop/compact.ts, state/compact.ts)  [only if over threshold]
```

Every arrow in that list is a plain function call — there is no hidden dispatcher, queue, or event
bus in the middle. That's deliberate: the harness's "smartness" is almost entirely in how these
plain functions are composed and ordered, not in any one of them individually. The rest of this
folder zooms into each box.
