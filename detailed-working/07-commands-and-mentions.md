# 07 — Commands and mentions

## The registry and parser

```ts
// src/commands/registry.ts
export function parseCommand(input: string): ParsedCommand | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) return null;
  const parts = trimmed.slice(1).split(/\s+/).filter((p) => p.length > 0);
  const name = parts[0] ?? "";
  return { name, args: parts.slice(1) };
}
```

`CommandRegistry` is a `Map<string, Command>` with the same duplicate-throws-on-register shape as
`ToolRegistry` (see [03-tools-and-registry.md](03-tools-and-registry.md)) — the harness reuses this
pattern everywhere a name-keyed lookup with fail-fast registration is needed. A `Command` is just
`{ name, description, run(ctx) => Promise<CommandResult> }`; `CommandContext` carries `projectKey`,
the current `sessionId`, and the parsed `args`.

`CommandResult.newMessages` / `newSessionId` are how a command replaces the running conversation —
`App.tsx`'s `handleSubmit` checks for `newMessages` after any command runs and, if present, swaps
`messagesRef.current` and re-renders `history` from scratch instead of just appending the command's
text output.

## The eight built-in commands

| Command | File | Does |
|---|---|---|
| `/help` | `builtin/help.ts` | Lists every registered command (built dynamically from the registry, so it can never drift out of sync with what's actually registered) |
| `/new` | `builtin/new.ts` | Starts a fresh session id + fresh system-prompt-only message list, persists the new session's first record |
| `/session` | `builtin/session.ts` | No args: lists sessions for this project with a preview. With an index or id: switches, replaying via `resolveSession` |
| `/compact` | `builtin/compact.ts` | Manually triggers `compactSession` (see [05-state-and-sessions.md](05-state-and-sessions.md)) |
| `/plan` | `builtin/plan.ts` | Spawns the built-in `plan` agent as a background task (see [09-agent-runtime-and-background-tasks.md](09-agent-runtime-and-background-tasks.md)) |
| `/tasks` | `builtin/tasks.ts` | Lists background agent tasks and their status |
| `/eval` | `builtin/eval.ts` | Evaluates the last turn, optionally with an LLM judge (`eval llm`), retrying on failure (see [11-evaluation-and-repair.md](11-evaluation-and-repair.md)) |
| `/exit` | `builtin/exit.ts` | Prints a goodbye and sets `CommandResult.exit = true` |

`createCommandRegistry` (`builtin/index.ts`) wires all eight, injecting whatever each one's closure
needs (`provider`, `registry`, `hooks`, `taskManager`) at startup — commands that don't need extra
dependencies (`new`, `session`, `exit`) are plain exported objects; the rest are factory functions
returning a `Command`, so their dependencies are captured once, not threaded through every call.

`/exit` only sets a flag; **`App.tsx` is what actually terminates the process**, and does so
deliberately rather than just calling Ink's `exit()`:

```ts
if (result.exit) {
  exit();
  // exit() only unmounts the Ink UI; it doesn't terminate the process. Ctrl+C
  // kills the whole process (and, as a side effect, the stdio-piped MCP
  // server child processes with it). Match that here, instead of leaving the
  // event loop alive on those still-open child-process handles.
  process.exit(0);
}
```

See [pre-req/06-signals-and-process-lifecycle.md](../pre-req/06-signals-and-process-lifecycle.md)
for why an open stdio pipe to a child process keeps Node's event loop alive even after the UI is
gone. (The bare `exit` / `quit` words typed with no leading `/` — handled earlier in
`handleSubmit`, before command parsing — follow this exact same two-call pattern for the same
reason.)

## `@mentions`

Two independent mention mechanisms exist, and it's easy to conflate them:

1. **`expandMentions`** (`src/commands/mentions.ts`) — runs on every plain (non-command,
   non-agent-mention) turn, resolving `@token` against skills first, then falling back to file
   paths. Covered in detail in [01-end-to-end-turn.md](01-end-to-end-turn.md) step 3.
2. **`findAgentMention`** (`src/agents/mentionMatch.ts`) — runs *before* mention expansion or
   command parsing, checked first in `handleSubmit`, and only ever matches a token against known
   **agent** names (bare `@plan` or spec-form `@plan-agent`). If it matches, the turn is diverted
   entirely into a background sub-agent run and never reaches `expandMentions` or the normal loop.

So `@plan-agent investigate the bug` spawns a sub-agent; `@src/index.ts summarize this` expands to
a file-content block appended to a normal turn. The dispatch order in `handleSubmit` (exit words →
agent mention → slash command → plain turn) is what keeps these from colliding.

## Autocomplete helpers

`suggest.ts` and `pathSuggest.ts` back `InputBox`'s hint UI (see [06-tui.md](06-tui.md)) but are
pure, TUI-independent functions — deliberately, so they're testable without touching Ink:

- `matchByPrefix` / `matchCommands` — case-insensitive `startsWith` filtering; an empty prefix
  returns everything in original order, which is what makes a bare `/` show the full menu.
- `currentAtToken` — extracts the in-progress `@token` the user is mid-typing (an `@` preceded by
  start-of-string or whitespace, with no trailing whitespace yet) via
  `/(?:^|\s)@(\S*)$/`. Unlike `/` commands, `@` mentions can appear anywhere in the input, so this
  scans for a trailing token rather than checking line-start.
- `splitPathToken` / `listPathCandidates` — turn a partial path like `"src/tu"` into `{dir: "src",
  partial: "tu"}` and list matching directory entries, directories suffixed `/` like shell
  completion, dotfiles hidden unless the partial itself starts with `.`.
