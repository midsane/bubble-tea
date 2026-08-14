# 03 — The event loop, Promises, EventEmitter, and async iterables

## Node is single-threaded, and that's a feature here

JavaScript in Node runs on one thread. Nothing runs "in parallel" in the traditional sense; instead
I/O operations (reading a file, a network request, waiting on a child process) are handed off to
the runtime, and your code is free to keep running other JavaScript while that I/O is pending — the
event loop is what resumes your code when the I/O completes. This is why `TaskManager.start()`
(`src/agents/taskManager.ts`) can kick off a sub-agent's model calls and tool executions "in the
background" **without** spawning a thread or process:

```ts
start(label: string, fn: () => Promise<string>): string {
  const id = randomUUID();
  this.tasks.set(id, { id, label, status: "running", ... });
  fn().then(
    (result) => this.settle(id, { status: "completed", result }),
    (err) => this.settle(id, ...)
  );
  return id;  // returns immediately — fn() keeps running, interleaved with everything else
}
```

`fn()` returns a `Promise` immediately; `start()` doesn't `await` it, so control returns to the
caller right away while `fn`'s actual work (network calls to the model provider, tool execution)
proceeds concurrently, interleaved with the TUI's own rendering and input handling on the same
thread. This is real concurrency (multiple things logically in progress) without real parallelism
(no two lines of JS ever execute at the literal same instant) — sufficient for a harness whose
bottleneck is waiting on network responses, not CPU work.

## `async`/`await` is sequencing sugar over Promises

`await x` doesn't block the thread — it suspends the current `async function` until `x` settles,
letting the event loop run other pending work in the meantime, then resumes. `runTurn`
(`src/loop/index.ts`) reads as a straightforward `for` loop with `await`s inside it, but every
`await provider.stream(...)` and `await registry.execute(...)` is a point where, underneath, other
JS (a keypress handler, a background task's own progress) could run before this function resumes.

## `EventEmitter`: a callback registry, not a queue

```ts
export class TaskManager extends EventEmitter {
  ...
  this.emit("update", { ...task });
}
```

`EventEmitter` (Node's built-in pub/sub primitive) is how `TaskManager` tells `App.tsx` "a
background task's status changed" without either side polling. `taskManager.on("update", fn)`
registers `fn` to be called, synchronously, every time `emit("update", ...)` runs — there's no
queue, no delay, no persistence; a listener registered *after* an `emit` already happened simply
never sees that particular emission. That's exactly why `App.tsx` subscribes once in a `useEffect`
that runs on mount, before any background task could plausibly finish.

## Async iterables: how streaming responses are consumed

```ts
for await (const event of provider.stream(messages, tools, chatOptions)) {
  if (event.type === "delta") onProgress?.(event.text);
  else result = event.result;
}
```

`provider.stream()` returns an `AsyncIterable<StreamEvent>` — an object with a
`[Symbol.asyncIterator]` method that yields `Promise`-wrapped values one at a time.
`GeminiProvider.stream()` and `OpenRouterProvider.stream()` are both `async function*` (async
generator) methods: `yield { type: "delta", text: content }` pauses the generator and hands one
event to the consumer, `for await` resumes it to produce the next one. This is what lets a
provider push partial text to the TUI as it arrives, rather than the caller having to wait for the
entire response and then render it all at once — the generator *is* the pipe between "bytes
arriving over the network" and "text painted to the terminal."

## Where this matters when reading `src/`

Every `async`/`await` in this codebase is sequencing, not threading — there is no data race to
worry about between two pieces of *your own* code, only between your code and whatever I/O it's
waiting on. The one place true concurrency (multiple `fn()`s genuinely interleaved) shows up is
`TaskManager` — a background agent run and the main session's own turn really can be in flight at
the same time, both making network calls, both eventually calling back into the same `App`
component's state setters.
