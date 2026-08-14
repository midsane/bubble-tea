# bubble-tea 🧋

A small, from-scratch **coding agent harness** — the scaffolding around an LLM that turns it into
something like Claude Code: a terminal UI, a tool-calling loop, persistent sessions, sub-agents,
guardrails, MCP integration, and an evaluation/repair loop. Built to demonstrate *harness
engineering* — the ~13 separately-buildable layers a coding agent actually needs — not to be a
maximal, production-grade product.

> Research consensus (cited in [`artifacts/implementation-process.md`](artifacts/implementation-process.md))
> holds that a coding agent is mostly *not* the model call: one analysis found 98.4% of Claude
> Code's codebase is operational infrastructure (context management, permission routing, tool
> orchestration, session persistence) and only ~1.6% is the model deciding what to do next. This
> repo is built the same way: a deliberately thin loop, wrapped in real infrastructure.

If you want to actually understand *how* it works, start with [`detailed-working/`](detailed-working/README.md)
(a full pipeline-by-pipeline trace with real code) and [`pre-req/`](pre-req/README.md) (the OS/process
concepts the implementation leans on — pipes, stdio, the event loop, signals — for readers newer to
systems programming).

## What it does

- **Talks to two model providers** behind one interface — Gemini (native function calling) and
  OpenRouter (OpenAI-compatible SSE streaming) — swappable via an env var.
- **Runs a plan → act → observe loop**: the model calls tools, tool results feed back in, repeat
  until it produces a final answer or hits an iteration cap.
- **Ships four built-in tools** (`read_file`, `write_file`, `bash`, `list_dir`) and transparently
  merges in tools from any connected **MCP server** — the loop never knows the difference.
- **Renders a real terminal UI** with [Ink](https://github.com/vadimdemedes/ink) (React for
  terminals): streaming tokens, a mascot splash, slash-command and `@mention` autocomplete with
  arrow-key selection.
- **Persists every session** as an append-only JSONL transcript under `~/.bubbletea/sessions/`,
  resumable via `/session` or `--resume`.
- **Compacts context** — manually via `/compact` or automatically once a session crosses a token
  threshold — by summarizing older turns into a single record instead of deleting history.
- **Enforces guardrails deterministically**: regex-based pre/post tool-call hooks
  (`~/.bubbletea/hooks/config.json`) that can deny a dangerous `bash` call before it runs, not just
  ask the model nicely not to.
- **Spawns sub-agents** with their own system prompt, restricted tool access, and isolated session —
  a built-in `plan` (read-only, investigate-and-report) agent, invocable via `/plan` or
  `@plan-agent`, running in the background so the main session stays responsive.
- **Evaluates and repairs its own output** — a rule-based checker plus an optional LLM-as-judge
  scorer, wired to a bounded retry loop (`/eval`) that re-prompts the model with the failure reason
  until it passes or the retry budget runs out.

## Quickstart

```bash
bun install
cp .env.example .env   # set PROVIDER + the matching API key
bun run dev             # or: npm install && npm run dev
```

`.env` needs `PROVIDER=openrouter` + `OPENROUTER_API_KEY`, or `PROVIDER=gemini` + `GEMINI_API_KEY`
(see [`.env.example`](.env.example)). First run creates `~/.bubbletea/` (skills, agents, hooks,
`mcp.json`) with sensible defaults, seeded once and left alone after.

Resume your most recent session in this directory instead of starting fresh:

```bash
bun run dev -- --resume
```

Inside the TUI, type `/help` for the full command list, a bare `/` or `@` to see every command /
skill / agent / file completion available, and `/exit` to quit cleanly.

## Architecture at a glance

```
Provider (Gemini | OpenRouter)
        ↕ chat() / stream()
   Execution loop (plan → act → observe)      ←→  Hooks (pre/post tool-call guardrails)
        ↕ tool calls
   Tool registry  ←── built-in tools + MCP-connected server tools (same interface, unified)
        ↕
   Ink TUI  ──  Commands (/help, /new, /session, /compact, /plan, /tasks, /eval, /exit)
        ↕                ──  @mentions (@file, @skill-name, @agent-name)
   State store (append-only JSONL sessions, resumable, compactable)
        ↕
   Sub-agents (isolated context + scoped tools) ──  Background task manager
        ↕
   Evaluation (rule-based + LLM-judge) → bounded repair retry loop
```

Every one of those boxes is a real, separately-testable module under `src/` — see
[`detailed-working/`](detailed-working/README.md) for what each one does, why it's shaped that
way, and the actual code that implements it.

## Project layout

```
src/
  providers/     Provider interface + gemini.ts, openrouter.ts adapters
  tools/         Tool registry + builtin/ (read_file, write_file, bash, list_dir)
  loop/          Core plan-act-observe loop, context-compaction planning
  tui/           Ink components: App, MessageStream, InputBox, StatusBar, Mascot
  commands/      Slash command registry + @mention / @path autocomplete
  state/         Session store: JSONL transcripts, resolve/compact
  config/        ~/.bubbletea loader: paths, skills, frontmatter parsing, first-run seeding
  hooks/         Pre/post tool-call guardrail pipeline
  agents/        Agent definitions, isolated sub-agent runs, background task manager
  mcp/           MCP client — connects external servers, wraps their tools as Tool
  mcp-servers/   Three example standalone MCP servers (web-search is wired in by default)
  eval/          Evaluators (rule-based, LLM-judge) + the retry/repair loop

detailed-working/   Full pipeline-by-pipeline trace of how the harness works, with real code
pre-req/            OS/process concepts (pipes, stdio, event loop, signals) this repo leans on
artifacts/           Original design research and phased build plan (historical, for context)
```

## Known limitations

This is a demo-scale harness, not a production tool — some corners are intentionally cut:

- **No automated tests.** There's no test runner, test script, or test files in this repo —
  correctness so far rests on `tsc --noEmit` and manual runs. Worth adding before extending this
  much further.
- **`MessageStream` doesn't manage terminal height or scrolling** — a long session will scroll past
  what your terminal can show; there's no pager or truncation.
- **Background execution is same-process, not a real supervisor** — `TaskManager` tracks concurrent
  `Promise`s, not `worker_threads` or child processes. Fine for a single-user, single-machine
  harness; wouldn't survive a process crash, unlike a real job queue.
- **`AUTO_COMPACT_TOKEN_THRESHOLD` (6,000) is a deliberately low demo value**, not a tuned budget —
  it's set low so auto-compaction is easy to trigger and observe, not to match any real model's
  actual context window.
- **`projectKey()` is the cwd with `/` replaced by `-`**, so sessions are scoped per exact working
  directory — running the same project from a different subdirectory lands in a different session
  namespace, by design (simple, greppable on disk) but worth knowing.
- **Hooks are declarative regex rules only** — `~/.bubbletea/hooks/config.json` matches tool name +
  a regex against arguments/output; there's no arbitrary script execution, despite `hooks/` existing
  as a directory (reserved for that, not yet used that way).

## License

Personal / educational project — no license file yet, treat as all-rights-reserved unless the
author says otherwise.
