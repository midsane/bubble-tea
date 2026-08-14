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
