# 02 — stdio, pipes, and using them as an RPC channel

## The three standard streams

Every process on a Unix-like system starts with three open file descriptors:

- **fd 0 — stdin**: input the process reads
- **fd 1 — stdout**: normal output
- **fd 2 — stderr**: error/diagnostic output, kept separate from stdout on purpose so the two can
  be redirected independently

By default these are connected to your terminal. Shell redirection (`command > file`,
`command 2>&1`, `cmd1 | cmd2`) is just the shell rewiring which file descriptor points where before
it execs the program — the program itself never has to know or care whether fd 1 is a terminal, a
file, or the input end of another process.

## A pipe: an in-kernel, one-directional byte stream between two processes

`cmd1 | cmd2` connects `cmd1`'s stdout directly to `cmd2`'s stdin via a kernel-managed pipe — bytes
written by one appear, in order, as bytes readable by the other, with no intermediate file on disk.
Node's `child_process.spawn` gives you the equivalent programmatically: `child.stdin`,
`child.stdout`, and `child.stderr` are streams you can write to / read from directly from your own
process's code.

## MCP: stdio repurposed as a request/response protocol

This is the part that isn't obvious from general Unix knowledge alone: **MCP (Model Context
Protocol) uses stdin/stdout not for human-readable output, but as the transport for structured
JSON-RPC-style messages.** When `src/mcp/client.ts` connects to a server:

```ts
const transport = new StdioClientTransport({ command: server.command, args: server.args });
await client.connect(transport);
```

`StdioClientTransport` spawns the server process and treats its stdout as an inbound message
stream and its stdin as an outbound one. Every `client.listTools()` or `client.callTool(...)` call
is, underneath, writing a JSON message to the child's stdin and reading a JSON response back off
its stdout — the exact same physical mechanism as `cmd1 | cmd2`, just carrying structured RPC
payloads instead of plain text.

This has a direct, practical consequence visible in `src/mcp-servers/*.ts`: **a server must never
print anything unstructured to stdout**, because doing so would corrupt the RPC stream the client
is trying to parse. That's why diagnostic/error output in those files goes to `console.error`
(stderr) rather than `console.log` (stdout) — stderr is not part of the protocol channel and is
safe to use for logging.

## Why the `isEntryPoint` guard exists

```ts
// src/mcp-servers/web-search.ts (and the other two example servers)
const isEntryPoint = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntryPoint) { main().catch(...); }
```

`main()` calls `server.connect(new StdioServerTransport())`, which takes over the process's stdin —
it starts reading it as an RPC channel, not as normal input. That's exactly right when the file is
run as the actual spawned child process (`node dist/mcp-servers/web-search.js`), and exactly wrong
if the file is instead `import`-ed as a module — e.g. from a test that wants to call `webSearch()`
directly. Without the guard, importing the file for its plain function would have the side effect
of hijacking whatever process did the importing.

## Where else "stdio as a channel" shows up

The `bash` tool's `execAsync` also uses stdio, but in the simpler, classic sense: it captures
whatever the spawned shell writes to stdout/stderr as plain text and hands that text back as the
tool's result — no structured protocol, just "run this, give me back what it printed." The
distinction between "stdio carries plain text output" (the `bash` tool) and "stdio carries a
structured RPC protocol" (MCP) is entirely a convention the two ends agree on; the OS-level
mechanism (a pipe) is identical either way.
