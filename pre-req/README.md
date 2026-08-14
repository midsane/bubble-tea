# pre-req/

The user asked for this repo to work as an exhaustive reference for understanding an AI agent
harness. Understanding `src/` cleanly requires some operating-system and Node.js runtime concepts
that the code leans on without explaining — a `child_process.exec` call, a stdio pipe used as an
RPC channel, an `EventEmitter`, a SIGINT handler, an async iterable used for streaming. This folder
covers exactly those concepts, each one tied directly to the specific file in `src/` that uses it,
so the connection between "OS concept" and "line of code" is concrete rather than abstract.

If you're already comfortable with Unix processes, pipes, Node's event loop, and TCP/HTTP
streaming, you can skip straight to [`detailed-working/`](../detailed-working/README.md).

| File | Concept | Where it shows up in this repo |
|---|---|---|
| [01-processes-and-child-processes.md](01-processes-and-child-processes.md) | What a process is, `fork`/`exec`, `child_process` in Node | `bash` tool (`exec`), MCP server spawning (`StdioClientTransport`) |
| [02-stdio-pipes-and-the-mcp-protocol.md](02-stdio-pipes-and-the-mcp-protocol.md) | File descriptors 0/1/2, pipes, using stdio as an RPC channel | MCP client/server communication, the `isEntryPoint` guard pattern |
| [03-event-loop-and-async-iterables.md](03-event-loop-and-async-iterables.md) | Node's single-threaded event loop, `Promise`, `async`/`await`, `EventEmitter`, async generators | `runTurn`'s streaming loop, `TaskManager`, provider `stream()` methods |
| [04-streaming-http-and-sse-parsing.md](04-streaming-http-and-sse-parsing.md) | Chunked HTTP responses, Server-Sent Events, why line-buffering is necessary | `OpenRouterProvider.stream()`'s manual SSE parser |
| [05-filesystem-jsonl-and-config-dirs.md](05-filesystem-jsonl-and-config-dirs.md) | Append vs. rewrite, JSON Lines, XDG-style machine-root config dirs | Session transcripts, `~/.bubbletea/` |
| [06-signals-and-process-lifecycle.md](06-signals-and-process-lifecycle.md) | SIGINT/SIGTERM, what keeps a Node process alive, orphaned children | Ctrl+C behavior, `/exit`'s explicit `process.exit(0)` |
| [07-process-supervision-vs-same-process-concurrency.md](07-process-supervision-vs-same-process-concurrency.md) | What systemd (and process supervisors generally) actually do, contrasted with this repo's design choice not to use one | `TaskManager`'s same-process background tasks |

Each file is short and skimmable — this is a reference, not a textbook. Read the one row you need,
when a `detailed-working/` file links to it.
