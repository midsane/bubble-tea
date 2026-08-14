# detailed-working/

A pipeline-by-pipeline explanation of how bubble-tea actually works, grounded in the real code (not
the aspirational plan in `artifacts/`). Read [`01-end-to-end-turn.md`](01-end-to-end-turn.md)
first — it traces one real user turn through every layer, which is the fastest way to see how the
pieces fit together. Everything after that is reference material for a single layer, meant to be
read on demand.

| File | Covers |
|---|---|
| [01-end-to-end-turn.md](01-end-to-end-turn.md) | A single turn traced end-to-end: input → mentions → loop → provider → tools → hooks → display → persistence → auto-compact. Read this first. |
| [02-providers.md](02-providers.md) | The `Provider` interface, and how Gemini vs. OpenRouter each get translated to/from it (including SSE stream parsing). |
| [03-tools-and-registry.md](03-tools-and-registry.md) | The `Tool` interface, `ToolRegistry`, the four built-ins, and why MCP tools and built-ins are indistinguishable to the loop. |
| [04-execution-loop-and-hooks.md](04-execution-loop-and-hooks.md) | `runTurn`'s plan→act→observe cycle, and the pre/post tool-call hook pipeline that gives it deterministic guardrails. |
| [05-state-and-sessions.md](05-state-and-sessions.md) | JSONL transcript format, `TranscriptRecord` vs. `ChatMessage`, session resolution, and how `/compact` folds old turns into a summary without deleting them. |
| [06-tui.md](06-tui.md) | The Ink component tree: `App`'s state management, streaming render, and `InputBox`'s slash-command/`@mention`/`@path` autocomplete. |
| [07-commands-and-mentions.md](07-commands-and-mentions.md) | The slash-command registry, all eight built-in commands, and `@file`/`@skill` mention expansion. |
| [08-config-skills-and-agents.md](08-config-skills-and-agents.md) | The `~/.bubbletea` config directory convention, first-run seeding, skill/agent definition loading and frontmatter parsing. |
| [09-agent-runtime-and-background-tasks.md](09-agent-runtime-and-background-tasks.md) | How a sub-agent actually runs (isolated context, scoped tools), `@agent-name` mention dispatch, and the same-process background task manager. |
| [10-mcp-integration.md](10-mcp-integration.md) | The MCP client, how external tools get namespaced and wrapped into the registry, and the three example standalone MCP servers. |
| [11-evaluation-and-repair.md](11-evaluation-and-repair.md) | Rule-based and LLM-judge evaluators, and the bounded retry loop that re-prompts the model with failure feedback. |

## A note on sources

`artifacts/implementation-process.md` is the *design* document — it describes what was planned,
including things that were considered but not built as originally imagined (e.g. it mentions
task-matched skill auto-injection; the actual code only ever injects a skill on an explicit
`@skill-name` mention). Everything in this folder describes the code as it exists, cross-checked
against `src/` directly. Where the plan and the implementation diverge, this folder follows the
implementation and calls out the difference.
