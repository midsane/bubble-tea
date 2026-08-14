# 06 — Signals and the process lifecycle

## What keeps a Node process running

A Node process exits automatically once its event loop has nothing left to do — no pending timers,
no pending I/O, no open handles (an open server socket, an open pipe to a child process, a pending
`setInterval`). As long as *anything* is still keeping the event loop "alive," the process keeps
running even if your own application logic thinks it's finished.

This is exactly the trap `App.tsx` calls out explicitly in its `/exit` handling:

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

Ink's `useApp().exit()` unmounts the React tree and restores the terminal to normal mode — it does
**not** call `process.exit`. If any MCP server child process is still connected (a live stdio pipe
is an open handle — see `pre-req/02-stdio-pipes-and-the-mcp-protocol.md`), the Node process would
keep running after the UI disappears, looking hung, until something else closed those handles.
`process.exit(0)` forces immediate termination regardless of what's still open, matching what
happens naturally on Ctrl+C.

## Signals: how a running process gets told to stop

A signal is an asynchronous notification sent to a process by the OS (or another process). The two
relevant to normal termination:

- **SIGINT** — sent when you press Ctrl+C in a terminal that has the process in the foreground.
  Node's default behavior on SIGINT is to exit. Because signals propagate to a whole **process
  group** (a foreground terminal job and its child processes together) by default, Ctrl+C reaching
  bubble-tea's Node process also reaches any child processes it spawned (an MCP server's process,
  a `bash` tool's shell) — which is exactly the "kills the whole process (and, as a side effect,
  the stdio-piped MCP server child processes with it)" behavior the comment above references as
  the baseline `/exit` is deliberately matching.
- **SIGTERM** — the "please terminate gracefully" signal, typically sent by process managers
  (`kill <pid>`, container orchestrators stopping a container) rather than an interactive terminal.
  Node's default behavior is also to exit, but unlike SIGINT it's conventionally treated as an
  opportunity to clean up first (close database connections, flush buffers) before actually
  exiting — this repo doesn't install a custom SIGTERM handler, so the default (immediate exit)
  applies.

## Orphaned children

If a parent process dies without its children being explicitly terminated, and the OS's automatic
"kill the whole process group" behavior doesn't apply (e.g. the child was detached, or the parent
was killed hard enough to skip that propagation), the child becomes an **orphan** — still running,
now reparented to an init-like process, with no supervisor watching it. An MCP server process
spawned via `StdioClientTransport` that outlives bubble-tea's own process would be exactly this: a
stray Node process nobody's talking to anymore, still holding resources. This is the concrete risk
the `/exit` and bare-exit-word handling in `App.tsx` is defending against by forcing
`process.exit(0)` rather than trusting Ink's `exit()` alone to clean everything up.

## Where this matters when reading `src/`

`App.tsx` has two `process.exit(0)` call sites (the bare `exit`/`quit` word path and the `/exit`
command path), both preceded by this same reasoning — both compensating for the same fact: a live
pipe to a child process is an open handle, open handles keep Node alive, and unmounting a UI
component is not the same operation as tearing down process-level resources. (`src/cli.ts` also has
a `process.exit(1)`, but that one's unrelated — it's a top-level `main().catch()` crash handler for
startup failures, not this cleanup pattern.)
