# 09 — Running a sub-agent, and the background task manager

## `runAgent`: isolated context, scoped tools, its own session

```ts
// src/agents/run.ts
export async function runAgent(
  definition: AgentDefinition,
  provider: Provider,
  registry: ToolRegistry,
  hooks: HooksConfig,
  projectKey: string,
  parentSessionId: string,
  task: string
): Promise<AgentRunResult> {
  const sessionId = newSessionId();
  const scopedRegistry = registry.subset(definition.allowedTools);
  const messages: ChatMessage[] = [
    { role: "system", content: definition.systemPrompt },
    { role: "user", content: task },
  ];

  await appendMessages(projectKey, sessionId, messages, parentSessionId);
  const result = await runTurn(provider, scopedRegistry, messages, hooks, { model: definition.model });
  await appendMessages(projectKey, sessionId, messages.slice(2), parentSessionId);

  return { sessionId, result };
}
```

Three isolation properties, all from reusing pieces already covered elsewhere rather than
special-casing agents:

- **Fresh message history** — `messages` starts as just the agent's own system prompt + the task,
  never the caller's conversation. A sub-agent has no memory of what the main session discussed.
- **Scoped tools** — `registry.subset(definition.allowedTools)` (see
  [03-tools-and-registry.md](03-tools-and-registry.md)) restricts what the loop can even attempt to
  call, not just what the prompt asks it to avoid.
- **A separate session record, linked not merged** — `parentSessionId` is passed to
  `appendMessages`, so the sub-agent's transcript is its own `.jsonl` file (`newSessionId()`), with
  `parentSessionId` pointing back to the caller's session id. It is never appended to the caller's
  own transcript.

It's literally `runTurn` — the same plan-act-observe loop everything else uses (see
[04-execution-loop-and-hooks.md](04-execution-loop-and-hooks.md)) — called with a different
registry and a throwaway message array. No agent-specific execution engine exists.

## Two ways to invoke an agent, one code path underneath

- **`/plan <task>`** (`src/commands/builtin/plan.ts`) — looks up the `plan` agent definition by
  name, then calls `taskManager.start(...)`.
- **`@plan-agent <task>`** (or bare `@plan`) — `findAgentMention` matches the token against loaded
  agent names (see [07-commands-and-mentions.md](07-commands-and-mentions.md)), and `App.tsx`
  calls `taskManager.start(...)` directly, inline in `handleSubmit`, before mention expansion or
  command parsing ever run.

Both land in the same `taskManager.start(label, async () => { const { sessionId, result } =
await runAgent(...); return \`[session ${sessionId}]\n${result}\`; })` shape — the command and the
mention are just two different triage paths to the same background-spawn call.

## `TaskManager`: same-process concurrency, not a job queue

```ts
// src/agents/taskManager.ts
export class TaskManager extends EventEmitter {
  private readonly tasks = new Map<string, BackgroundTask>();

  start(label: string, fn: () => Promise<string>): string {
    const id = randomUUID();
    const task: BackgroundTask = { id, label, status: "running", startedAt: new Date().toISOString() };
    this.tasks.set(id, task);
    this.emit("update", { ...task });

    fn().then(
      (result) => this.settle(id, { status: "completed", result }),
      (err) => this.settle(id, { status: "failed", error: err instanceof Error ? err.message : String(err) })
    );

    return id;
  }
  // settle() patches status + emits "update" again; list()/get() for /tasks and polling
}
```

"Background" here means a `Promise` that isn't awaited by the caller — `fn()` starts running
immediately and `start()` returns the task id right away, before `fn` resolves. This is **not**
`worker_threads` or a child process: it's ordinary concurrent async work on the same event loop as
everything else (see
[pre-req/03-event-loop-and-async-iterables.md](../pre-req/03-event-loop-and-async-iterables.md)),
sufficient for a single-user, single-machine harness but not something that would survive a process
crash or scale to a real multi-worker job queue — see the README's Known Limitations.

Every state transition emits `"update"` with a snapshot (`{ ...task }`, a copy, so a subscriber
can't mutate internal state) — `App.tsx` subscribes once (see [06-tui.md](06-tui.md)) and `/tasks`
just calls `taskManager.list()` on demand; both read from the exact same `Map`, there's no separate
polling path.
