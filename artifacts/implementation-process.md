# bubble-tea: Coding Agent Harness — Research & Implementation Plan

Source of requirements: [`architecture.md`](../architecture.md).
Stack decision (confirmed with user): **TypeScript / Node.js**.

---

## 1. What "harness engineering" actually means

A coding agent harness is mostly *not* the model call. Industry consensus (see
[awesome-harness-engineering](https://github.com/ai-boost/awesome-harness-engineering) and the
Claude Code architecture writeup below) is that a harness is scaffolding around a thin reasoning
loop: context delivery, tool interfaces, planning artifacts, verification loops, memory systems,
and guardrails. One analysis of Claude Code found **98.4% of its codebase is operational
infrastructure** (context management, permission routing, tool orchestration, session
persistence) and only ~1.6% is agentic decision logic — the model decides *what* to do, the
harness enforces *how* and *whether* it happens.
([Dive into Claude Code](https://arxiv.org/html/2604.14228v1))

That reframes the project: don't try to build a smarter loop, build a well-layered harness around
a deliberately simple loop.

## 2. Reference architecture we're borrowing from (Claude Code)

Claude Code decomposes into 5 layers, which map cleanly onto what `architecture.md` asks for:

| Claude Code layer | Purpose | Maps to our spec |
|---|---|---|
| Surface | CLI / TUI / SDK entry points, all sharing one loop | TUI layer |
| Core | `queryLoop()`: context assembly → model call → tool dispatch → repeat, plus compaction | execution loop, `/compact` |
| Safety/Action | permission gates, hooks, sandboxing, subagent spawn | lifecycle, guardrails |
| State | append-only JSONL transcripts, resumable sessions, CLAUDE.md-style instruction hierarchy | state store, `/session` |
| Backend | shell exec, filesystem, MCP, built-in tools | tool registry |

Its 4 extensibility mechanisms, ordered by context cost (cheap → expensive): **Hooks** (fixed
interception points) → **Skills** (on-demand instruction packs) → **Plugins** (bundles of
tools+hooks) → **MCP servers** (full external tool schemas always in context). This tells us to
implement skills before MCP — skills are cheaper to build and cheaper at runtime.

Its recommended build order (directly reusable):
1. Basic loop → context assembly → model call → tool dispatch
2. Single permission gate → expand to layered checks
3. Session storage (append-only) → resume/fork
4. Built-in tools → MCP → hooks → skills
5. Compaction pipeline, staged
6. Subagent delegation with isolated context

We adopt this shape, adapted to our own module list below.

## 3. Sub-problems extracted from `architecture.md`

Breaking the spec into independently buildable modules:

1. **Provider abstraction** — unify Gemini and OpenRouter behind one interface (chat, streaming, tool-calling schema translation).
2. **Tool registry** — capability registration, JSON-schema tool defs, dispatch, result formatting.
3. **Execution loop** — plan/act/observe cycle: assemble context → call model → parse tool calls → execute → feed observation back → repeat until done.
4. **TUI shell** — terminal rendering: message stream, input box, streaming tokens, spinners, status bar.
5. **Command system** — `/help`, `/new`, `/session`, `/compact`, and `@file` / `@agent` / `@skill` mention parsing.
6. **State store** — persistent memory across turns and sessions (transcripts, resume/list).
7. **Context compaction** — `/compact` plus automatic trigger as context fills.
8. **`.bubbletea` config directory** — machine-root convention (like `~/.claude`) for skills, agent defs, MCP server config, hooks.
9. **Lifecycle hooks & guardrails** — pre/post tool-call interceptors, validators, permission gating.
10. **Sub-agent system** — agent definitions, built-in `plan` agent, invocation via `@plan-agent` / `/plan`.
11. **Parallel/background execution** — spawn agents as background tasks, track + surface status.
12. **MCP integration** — connect external MCP servers, register their tools into the registry.
13. **Evaluation interface** — verify/score/improve agent output (rule-based + LLM-judge).

This is 13 modules — deliberately not more. A version that "shows good understanding of harness
engineering" needs each layer to *exist and be correctly separated*, not to be maximally featured.

## 4. Recommended build order (5 phases)

The guiding principle, straight from the Claude Code build-order research: **get one thin,
working loop end-to-end before adding any safety, UI polish, or extensibility.** Every phase after
Phase 1 wraps the same loop; nothing in Phase 1 should have to be rewritten later.

### Phase 1 — Core skeleton (prove the loop works)
1. Project scaffold (TS project, CLI bin entry, build/dev scripts).
2. Provider abstraction: one internal `Provider` interface (`chat()`, `stream()`, tool-call
   parsing) with an OpenRouter adapter first (OpenAI-compatible REST — least friction), then a
   Gemini adapter (`@google/genai`, native function calling).
3. Minimal tool registry with 3–4 built-ins: `read_file`, `write_file`, `bash`, `list_dir`.
4. Core execution loop: single-threaded plan→act→observe cycle against a plain readline CLI (no
   TUI yet) — this is the fastest way to validate provider + tools + loop together before
   investing in rendering.

### Phase 2 — TUI & commands (make it feel like Claude Code)

> Superseded by [`phase2-breakdown.md`](phase2-breakdown.md), which reorders item 5 (Ink) to run
> last as step 2.5 instead of first — same "loop before UI" rationale as Phase 1, applied one
> level deeper. Follow the breakdown doc's step order (2.1–2.5) when implementing; the items below
> are the original unordered scope.

5. Ink-based TUI shell replacing the readline CLI: message stream, input box, streaming output,
   status/spinner. Ink is the right choice here — it's the same library Claude Code, Gemini CLI,
   and GitHub Copilot CLI are built on, gives React-style component composition, Flexbox layout
   via yoga-layout, and a mature ecosystem (`ink-select-input`, `ink-progress-bar`, InkUI
   component kit).
6. Slash command framework: `/help`, `/new`.
7. State store: append-only JSONL transcripts per session, `/session` to list/switch/resume.
   (Append-only files, not a database — matches Claude Code's own pattern and keeps sessions
   auditable/diffable without a DB dependency.) Design the record schema for what later phases
   need, even though those phases aren't built yet: every record gets a stable id and a
   `parentSessionId` field (empty for top-level sessions, set for sub-agent sidechains — Phase 4),
   plus a `summary`/`supersede` record type that can replace a range of prior records by id
   (Phase 5 compaction). Getting this schema right now avoids a transcript migration later.
8. `@file` tagging: parse mentions, inject file contents into context.

**Exit criteria — Phase 1:** a real model response drives a `write_file` tool call and the target
file changes on disk, observed end-to-end through the readline CLI.
**Exit criteria — Phase 2:** a session can be closed and resumed via `/session`, with the Ink TUI
replaying prior messages from the JSONL transcript exactly.

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

## 5. Why this order

- **Loop before UI.** A readline CLI proves provider + tools + loop compose correctly, before
  sinking time into Ink components that would otherwise need retrofitting.
- **State before hooks.** Hooks/guardrails need something to intercept and log against; building
  session persistence first means hook decisions are already auditable from day one.
- **Skills before MCP.** Skills are pure text injected on demand (cheap); MCP servers add
  always-on tool schemas and a client/connection lifecycle (expensive). Cheaper mechanism first.
- **Agents/parallelism before eval.** Sub-agents and background execution are core to the spec
  ("multi/sub agent support" is in the project name's intent); evaluation is a layer that scores
  *output* of a system that must already exist.
- **One thin loop, never rewritten.** Every later phase adds a layer around the Phase-1 loop
  (provider, tools, plan/act/observe) rather than replacing it — matches the "minimal scaffolding,
  maximal harness" philosophy the research converges on.

## 6. Key technical decisions

| Concern | Choice | Rationale |
|---|---|---|
| Language | TypeScript / Node.js | User decision |
| TUI | [Ink](https://github.com/vadimdemedes/ink) (React renderer for terminals) | Same library Claude Code, Gemini CLI, Copilot CLI use; component model + Flexbox via yoga-layout; ecosystem (ink-select-input, ink-progress-bar, InkUI) |
| Gemini SDK | `@google/genai` | Official TS/JS SDK, supports `generateContentStream()` and native function calling |
| OpenRouter | OpenAI-compatible REST (`openai` npm pkg with custom `baseURL`, or official `@openrouter/sdk`) | One key, `provider/model` slug addressing, automatic failover across providers |
| Tool protocol for external tools | [MCP](https://github.com/modelcontextprotocol/typescript-sdk) (`@modelcontextprotocol/sdk`) | Standard protocol; type-safe tool/resource/prompt schemas; works over stdio or HTTP |
| State store | Append-only JSONL files under `~/.bubbletea/sessions/<project-key>/` | No DB dependency, auditable, diffable, matches Claude Code's own approach; can graduate to SQLite later if querying needs grow. Anchored under the machine-root config dir (not project-local) per the spec's "only in machine root" constraint — `project-key` is derived from cwd so sessions stay scoped per project without a second config location |
| Config root | `.bubbletea/` at machine root (like `~/.claude`) | Per spec — one place for skills, agent defs, `mcp.json`, hooks |
| Guardrails enforcement | Hooks as deterministic interceptors, not prompt instructions | "Prompts are suggestions the LLM interprets; hooks are enforcement the LLM cannot override" |
| Evaluation | Rule-based checks + optional LLM-as-judge with explicit rubric | Rubric-based scoring reduces LLM-judge bias/drift vs. free-form scoring |

## 7. Proposed module layout (for when we start building)

```
bubble-tea/
  src/
    providers/        # Provider interface + gemini.ts, openrouter.ts adapters
    tools/             # registry.ts, builtin/ (read_file, write_file, bash, list_dir)
    loop/              # core plan-act-observe loop, context assembly
    tui/               # Ink components: App, MessageStream, InputBox, StatusBar
    commands/          # slash command handlers + @mention parsers
    state/             # session store, JSONL transcript read/write, resume/fork
    config/            # .bubbletea loader: skills, agents, mcp.json, hooks
    hooks/             # pre/post tool-call interceptor pipeline
    agents/            # agent definition loader, built-in plan agent, background task manager
    mcp/               # MCP client wiring into the tool registry
    eval/              # evaluators: rule-based + LLM-judge, retry/repair feedback loop
  artifacts/
    implementation-process.md   # this file
  architecture.md

~/.bubbletea/                   # machine root, created on first run
  skills/                       # SKILL.md packs
  agents/                       # agent definitions (built-in `plan` ships here)
  mcp.json                      # configured external MCP servers
  hooks/                        # pre/post tool-call interceptor scripts/config
  sessions/<project-key>/       # append-only JSONL transcripts, one dir per project cwd
```

## 8. Explicitly out of scope for v1

Per the "not gonna build a very complex version" note in `architecture.md`: no sandboxed/container
execution, no multi-level permission grades (single allow/deny gate is enough to demonstrate the
pattern), no vector-store memory (file-based state is sufficient), no distributed/multi-machine
agent execution (background = same-process async, not a job queue).

## Sources

- [awesome-harness-engineering](https://github.com/ai-boost/awesome-harness-engineering)
- [Dive into Claude Code: The Design Space of Today's and Future AI Agent Systems](https://arxiv.org/html/2604.14228v1)
- [Inside Claude Code: Architecture Behind Tools, Memory, Hooks, and MCP](https://www.penligent.ai/hackinglabs/inside-claude-code-the-architecture-behind-tools-memory-hooks-and-mcp/)
- [Claude Code Skills, Commands, Hooks & Agents Guide](https://genaiunplugged.substack.com/p/claude-code-skills-commands-hooks-agents)
- [Ink — React for interactive command-line apps](https://github.com/vadimdemedes/ink)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [OpenRouter docs](https://openrouter.ai/docs/llms.txt)
- [@google/genai npm](https://www.npmjs.com/package/@google/genai)
- [What Is the ReAct Loop?](https://www.mindstudio.ai/blog/what-is-react-loop-ai-agent-reasoning)
- [AI Agent Harness Architecture: Why State Belongs Outside It](https://www.pingcap.com/blog/ai-agent-harness-state-layer/)
- [Agentic Coding Hooks: Deterministic AI Guardrails](https://ranthebuilder.cloud/blog/agentic-coding-hooks-deterministic-ai-guardrails/)
- [Hooks: The Enforcement Layer That Turns Agent Policy Into Agent Fact](https://ranjankumar.in/hooks-policy-as-code-agent-enforcement)
- [How to Build an Agent Evaluation Framework With Metrics, Rubrics, and Benchmarks](https://galileo.ai/blog/agent-evaluation-framework-metrics-rubrics-benchmarks)
- [Rubric-Based Evaluations & LLM-as-a-Judge](https://medium.com/@adnanmasood/rubric-based-evals-llm-as-a-judge-methodologies-and-empirical-validation-in-domain-context-71936b989e80)
