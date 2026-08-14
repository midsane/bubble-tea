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
