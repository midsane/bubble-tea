# 01 — Processes and child processes

## What a process actually is

A process is a running program: its own memory space, its own set of open file descriptors
(stdin/stdout/stderr plus any files/sockets it has opened), its own process id (PID), and — on
Unix — a parent process that spawned it. When you run `node src/cli.ts`, the OS creates one process
for that Node runtime. Everything bubble-tea does — reading a file, running a shell command,
talking to an MCP server — either happens *inside* that one process or by creating a **new**
process and communicating with it.

## `fork` + `exec`, the two-step Unix primitive

Classic Unix process creation is two syscalls: `fork()` duplicates the calling process (parent and
child are, briefly, identical), then the child typically calls `exec()` to replace its own memory
image with a different program entirely. Node's `child_process` module wraps this pattern (plus the
Windows equivalent) behind a few higher-level functions:

- **`exec(command, callback)`** — runs `command` through a shell (`/bin/sh -c` on POSIX), captures
  stdout/stderr into buffers, and calls back when the process exits. This is what the `bash` tool
  uses (`src/tools/builtin/bash.ts`, via `promisify(exec)`):

  ```ts
  const { stdout, stderr } = await execAsync(command, { cwd: process.cwd(), timeout: TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 });
  ```

  Going through a shell means the command string can use pipes, globs, `&&`, and quoting exactly
  like a real terminal — but it also means whatever the model asks for runs with genuine shell
  semantics, which is precisely the trust boundary the hook system's default deny rules (see
  `detailed-working/04-execution-loop-and-hooks.md`) exist to narrow.

- **`spawn(command, args)`** — starts a process directly (no shell involved unless you ask for one)
  and gives you streaming access to its stdin/stdout/stderr as the process runs, rather than
  buffering everything until exit. This is what `StdioClientTransport` (from
  `@modelcontextprotocol/sdk`, used in `src/mcp/client.ts`) uses under the hood to start an MCP
  server process and keep a live, bidirectional pipe open to it — buffering until exit wouldn't
  work for a long-running server the harness needs to send multiple requests to over its lifetime.

## Timeouts and buffers exist because child processes are untrusted-by-default

The `bash` tool sets `timeout: TIMEOUT_MS` (30 seconds) and `maxBuffer: 10 * 1024 * 1024` (10MB).
Without a timeout, a hung or interactive command (one waiting on stdin that will never come) would
block that tool call forever. Without a buffer cap, a command that produces gigabytes of output
(an accidental `cat` on a huge file, an infinite loop that prints) could exhaust the parent
process's memory. Both are standard defensive defaults for "run something we don't fully control
and get a bounded amount of output back."

## Why this matters for reading `src/`

Anywhere you see `bash`'s tool being called, a shell subprocess is created and destroyed for that
one command — there's no persistent shell session across tool calls (each `bash` call is
independent; `cd` in one call doesn't affect the next). Anywhere you see an MCP server connection,
a **long-lived** child process was spawned once at startup (`connectMcpServers` in
`src/mcp/client.ts`) and stays alive for the harness's whole lifetime, communicating over a pipe —
covered next, in [02-stdio-pipes-and-the-mcp-protocol.md](02-stdio-pipes-and-the-mcp-protocol.md).
