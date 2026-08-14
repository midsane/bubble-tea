

### Phase 3 — Extensibility & safety
9. `.bubbletea` config directory convention (machine root, mirrors `~/.claude`): subfolders for
   `skills/`, `agents/`, `mcp.json`, `hooks/`.
10. Skills loading: discover `.bubbletea/skills/*/SKILL.md`, inject on `@skill-name` or when the
    task matches — implement before MCP since skills are cheap (just text injected on demand)
    versus MCP servers (always-present tool schemas, higher context cost).
11. Lifecycle hooks: pre/post tool-call interceptor points (`PreToolUse`, `PostToolUse` style),
    config-driven, so policy is enforced deterministically rather than left to the model's
    discretion — hooks are what make a rule "always happens" instead of "usually happens."
12. Guardrails/validators layer built on top of hooks: permission gate (allow/deny per tool),
    starting with a single gate and only adding graduated levels if there's time.

**Exit criteria — Phase 3:** a configured pre-tool hook denies a `bash rm` call and the loop
reports the denial back to the user instead of executing it; a skill placed in
`~/.bubbletea/skills/` is discoverable via `@skill-name`.

### Phase 4 — Agents & parallelism
13. Sub-agent framework: agent definition format (system prompt + allowed tools + optional model
    override), isolated context per sub-agent run, built-in `plan` agent, invocation via
    `@plan-agent` and `/plan`.
14. Background execution: task manager to spawn an agent run async (Node `worker_threads` or
    child process per run, or just a promise-based task queue if true isolation isn't needed),
    track running/finished state, surface status/results back into the TUI without blocking the
    main input loop.
15. MCP integration: MCP client (`@modelcontextprotocol/sdk`) connecting to configured external
    servers, registering their tools into the same registry used by built-ins — the registry
    should not need to know whether a tool is built-in, a skill, or MCP-provided.

**Exit criteria — Phase 4:** `/plan` spawns the built-in plan agent in the background while the
main session stays responsive to new input; its transcript is a child record linked to the parent
session via `parentSessionId` and its result surfaces in the TUI on completion.

### Phase 5 — Context management & evaluation (polish)
16. Context compaction: manual `/compact` first (summarize transcript, replace history with
    summary), then an automatic trigger once token/context budget crosses a threshold.
17. Evaluation interface: pluggable evaluators — start with cheap rule-based checks (did the tool
    calls succeed, did tests pass) plus an optional LLM-as-judge scorer with an explicit rubric;
    expose as a `/eval` command or an automatic post-task scoring hook. Close the loop implied by
    architecture.md's "verified, scored **and improved**": a failing eval feeds back into the
    execution loop as a bounded repair/retry pass (re-plan with the failure reason attached),
    capped at a small retry budget, with the unresolved failure surfaced plainly in the TUI once
    the budget is exhausted rather than silently giving up. Keep this last: it's the part of the
    spec that's genuinely optional for a working harness, and it's easiest to bolt on once the
    loop and state store already produce clean, inspectable transcripts to score.

**Exit criteria — Phase 5:** `/compact` replaces a span of transcript records with a single
summary record (old records marked superseded, not deleted) and the loop continues correctly from
the summary; an intentionally-failing task is retried by the eval feedback loop and either
self-corrects within budget or reports the unresolved failure.
