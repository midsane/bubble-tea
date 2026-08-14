# 07 — What a process supervisor (systemd, etc.) actually does, and why this repo doesn't use one

## What "background execution" means in this repo

`architecture.md` asks for "support parallel work -> can call agent in bg." `TaskManager`
(`src/agents/taskManager.ts`) delivers this as **an unawaited `Promise` on the same event loop as
everything else** (see [03-event-loop-and-async-iterables.md](03-event-loop-and-async-iterables.md)) —
not a separate OS process, not a thread, not a job handed off to any kind of supervisor. It's worth
being precise about what that choice does and doesn't give you, since "background task" can mean
several genuinely different things depending on the system.

## What a real process supervisor provides

Tools like **systemd** (Linux's init system and service manager), or general-purpose process
supervisors (`supervisord`, `pm2`, a container orchestrator restarting a crashed pod), exist to
solve problems that only appear once a task is a genuinely separate OS-level process:

- **Restart on crash.** A systemd service unit can declare `Restart=on-failure` — if the process
  dies, systemd starts a new one automatically. An unawaited `Promise` has no equivalent: if the
  *harness's own process* crashes, every in-flight background task simply stops existing, along
  with everything else in that process.
- **Survives independently of the thing that started it.** A systemd service keeps running after
  the terminal that triggered `systemctl start` closes, or after the admin who started it logs out.
  A `TaskManager` task is a `Promise` living inside one specific Node process; if that process
  exits (including via the `process.exit(0)` calls covered in
  [06-signals-and-process-lifecycle.md](06-signals-and-process-lifecycle.md)), every background
  task in flight is gone, no matter how far along it was.
- **Resource isolation.** A systemd unit can be given its own cgroup — memory limits, CPU quotas,
  restricted filesystem access. Node's `worker_threads` gives isolated JS execution but shares the
  process's memory address space and file descriptor table more than a full separate process would.
  A same-process `Promise` shares everything: memory, open handles, the event loop itself.
- **Genuine parallelism.** A supervisor can run multiple *processes*, which the OS can schedule on
  different CPU cores simultaneously. Everything in `TaskManager` runs on Node's one JS thread — see
  [03-event-loop-and-async-iterables.md](03-event-loop-and-async-iterables.md) for why that's still
  useful concurrency, just not parallelism.

## Why this repo deliberately doesn't reach for any of that

`artifacts/implementation-process.md` calls this out as an explicit scope decision: "background =
same-process async, not a job queue," alongside "no sandboxed/container execution" and "no
distributed/multi-machine agent execution." The reasoning holds up against what supervision
actually buys you: bubble-tea is a single-user, single-machine, interactive CLI tool. Nobody else
depends on a background `/plan` task surviving past the session that spawned it; there's no uptime
requirement that would justify auto-restart; and the harness's own crash already takes down the
foreground session the user is watching, so a background task outliving that crash wouldn't be
useful even if it were possible. Reaching for `worker_threads`, child processes, or an external job
queue here would add real complexity (serialization across the isolation boundary, a supervision
protocol, cleanup on abnormal exit) to solve a problem this tool doesn't actually have.

## The honest tradeoff

If you extended this harness toward something multi-user, long-running, or fault-tolerant — a
hosted service where a `/plan` run needs to survive the request that triggered it, or where one
user's runaway tool call shouldn't be able to affect another's — the same-process `Promise` model
in `TaskManager` would stop being sufficient, and you'd want exactly the properties a real
supervisor (or `worker_threads`/child-process isolation, at minimum) provides. Recognizing *when*
you've crossed that line is the actual skill here, not defaulting to heavyweight process
supervision for every "run this in the background" ask.
