# 06 — The TUI (Ink)

`src/tui/` is a thin rendering layer over already-correct logic — by design (see
`artifacts/phase2-breakdown.md`: the state store, commands, and mentions were all built and proven
against a plain readline CLI before Ink was added at all). Ink renders React components to the
terminal using Yoga (Flexbox) for layout; components re-render on state change exactly like in a
browser, just painted as ANSI escape sequences instead of DOM.

## Component tree

```
App (src/tui/App.tsx)
├── Mascot          — one-shot splash banner
├── MessageStream    — the scrollback: every past message + the current streaming response
├── StatusBar        — provider name, session id, spinner, background-task count
└── InputBox          — text entry + slash-command / @mention / @path autocomplete
```

`App` owns all the state that matters: the message history (`messagesRef`, a `ChatMessage[]` ref —
*not* React state, because the loop mutates it in place and a ref avoids fighting that), a parallel
`DisplayItem[]` (`history`, real state, drives what's rendered), `sessionId`, `busy`, and
`streamingText`.

### Why `sessionId` is both a ref and state

```ts
const sessionIdRef = useRef(initialSessionId);
const [sessionId, setSessionId] = useState(initialSessionId);
```

Persistence code (`appendMessages`, `compactSession`) needs the *current* session id synchronously,
without waiting for a re-render to commit a fresh closure — `handleSubmit` is an async function, and
by the time an `await` resolves, a stale closure over React state could be reading last turn's
`sessionId`. The ref is always current; the state variable exists purely so the `StatusBar` text
re-renders when the session changes. `switchSession()` updates both together.

### Streaming render

`onProgress` from `runTurn` is `setStreamingText` directly — every `"delta"` event (the running
total for the current provider call) triggers a re-render of `MessageStream`'s bottom line:

```tsx
<MessageStream items={history} streamingText={busy ? streamingText : ""} />
```

Gated on `busy` so a stale `streamingText` from a finished turn never lingers into the next idle
render.

### Background tasks surface asynchronously

```ts
useEffect(() => {
  function onUpdate(task: BackgroundTask) {
    setRunningTasks(taskManager.list().filter((t) => t.status === "running").length);
    if (task.status === "running") return;
    const text = task.status === "completed"
      ? `[background: ${task.label}]\n${task.result}`
      : `[background: ${task.label}] failed: ${task.error}`;
    setHistory((h) => [...h, notice(text, task.status === "failed" ? "error" : "info")]);
  }
  taskManager.on("update", onUpdate);
  return () => { taskManager.off("update", onUpdate); };
}, [taskManager]);
```

A `/plan` or `@agent-name` run finishes on its own schedule, completely outside any `handleSubmit`
call — subscribing once to `TaskManager`'s `"update"` event (an `EventEmitter`, see
[pre-req/03-event-loop-and-async-iterables.md](../pre-req/03-event-loop-and-async-iterables.md))
is what lets its result land in the message stream without the main input loop ever blocking on it.

## `InputBox`: three completion modes sharing one keyboard handler

`InputBox` computes candidate lists from plain string state on every render — no debounce needed
for the synchronous ones (slash commands, skill/agent names are already in memory):

```ts
const showSlashHints = value.startsWith("/") && !value.includes(" ");
const slashHints = showSlashHints ? matchCommands(commands, value.slice(1)).slice(0, MAX_HINTS) : [];
const atToken = currentAtToken(value);  // the in-progress "@token" being typed, if any
```

File-path completion is the exception — it needs a `readdir`, which is async, so it runs in an
effect keyed on the token itself:

```ts
useEffect(() => {
  let cancelled = false;
  if (atToken === undefined) { setFileHints([]); return; }
  const { dir, partial } = splitPathToken(atToken);
  if (dir === "." && partial === "") { setFileHints([]); return; }  // bare "@" stays skill/agent-only
  listPathCandidates(dir, partial).then((results) => { if (!cancelled) setFileHints(results); });
  return () => { cancelled = true; };
}, [atToken]);
```

The `cancelled` flag matters: without it, a slow `readdir` from an earlier keystroke could resolve
*after* a newer one and overwrite the fresher result with stale data — a classic async race that
keying-plus-cancellation avoids without needing a request-id scheme.

Arrow keys and Tab are handled by one `useInput` subscription, gated so it's inert whenever there's
nothing to select:

```ts
useInput((_input, key) => {
  if (busy || hintCount === 0) return;
  if (key.downArrow) { setSelectedIndex((i) => (i + 1) % hintCount); return; }
  if (key.upArrow) { setSelectedIndex((i) => (i - 1 + hintCount) % hintCount); return; }
  if (key.tab) { /* splice the selected completion into value, bump inputKey */ }
});
```

There is deliberately **no Tab-to-accept wired through a separate handler on `TextInput` itself** —
`ink-text-input`'s own `useInput` subscription doesn't stop propagation, so a second sibling
handler firing on the same keypress would corrupt the input by folding the raw Tab character into
`value` at the same time this handler tries to replace it. One handler, one source of truth.

The `inputKey` bump on completion exists because `ink-text-input` only re-syncs its internal cursor
offset when the *new* value is shorter than the old cursor position — a completion that lengthens
the value would otherwise leave the visible cursor stranded mid-string. Remounting the component
(via a changed `key` prop) forces it to reinitialize against the full completed value.

## Display mapping and theming

`messagesToDisplay` (`src/tui/display.ts`) and `theme.ts` are covered in
[01-end-to-end-turn.md](01-end-to-end-turn.md) (step 5) and inline in `theme.ts`'s own comment
respectively — one palette (pulled from the mascot art: gold for the user's voice, caramel for the
agent's, cream for tool/secondary text, brown for chrome, red for errors) shared across every
component so nothing picks its own ad-hoc colors.
