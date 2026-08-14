# 03 — Tools and the registry

## The interface

```ts
// src/tools/types.ts
export interface Tool {
  name: string;
  description: string;
  parameters: JsonSchema;
  execute(args: Record<string, unknown>): Promise<string>;
}
```

Every tool — built-in, MCP-provided, or in principle any future source — implements exactly this.
The loop, the registry, and providers never need a special case per tool source; a `ToolSchema`
(`name` + `description` + `parameters`) is what actually gets sent to the model, and it's derived
identically from any `Tool`.

## The registry

```ts
// src/tools/registry.ts
export class ToolRegistry {
  private readonly tools = new Map<string, Tool>();
  register(tool: Tool): void { /* throws on duplicate name */ }
  schemas(): ToolSchema[] { ... }
  async execute(name: string, args: Record<string, unknown>): Promise<string> {
    const tool = this.tools.get(name);
    if (!tool) return `Error: unknown tool "${name}"`;
    try { return await tool.execute(args); }
    catch (err) { return `Error: ${err instanceof Error ? err.message : String(err)}`; }
  }
}
```

`execute` **never throws** — a missing tool or a thrown error inside a tool both become an
`"Error: ..."` string handed back to the model as a normal tool-result message. This is a
deliberate design choice that runs through the whole harness: failures are *observations* the model
can react to and retry differently, not exceptions that abort the turn. `runTurn` (see
[04-execution-loop-and-hooks.md](04-execution-loop-and-hooks.md)) never has a try/catch around
`registry.execute` because it doesn't need one.

`subset(names)` returns a registry scoped to only the named tools — this is what gives a sub-agent
restricted tool access (see [09-agent-runtime-and-background-tasks.md](09-agent-runtime-and-background-tasks.md)).
One subtlety: **`subset(undefined)` returns `this`**, the same registry instance, not a copy — an
agent definition with no `allowedTools` shares the caller's actual registry object rather than
getting an equivalent-but-distinct one. Harmless today since nothing mutates a registry after
startup, but worth knowing if that ever changes.

## The four built-ins

All four live in `src/tools/builtin/` and share a shape: validate/default the arguments, do the
one filesystem or process operation, return a string (never an exception for an expected failure
case, e.g. a missing required argument returns `"Error: missing required argument ..."` rather than
throwing).

| Tool | What it does | Notable limit |
|---|---|---|
| `read_file` | Reads a file relative to `process.cwd()` | Truncates at 50,000 chars, with a note |
| `write_file` | Writes a file, creating parent dirs (`mkdir -p` equivalent) | Always overwrites — no merge/patch mode |
| `bash` | Runs a shell command via `child_process.exec` (through `promisify`) | 30s timeout, 10MB output buffer, output truncated at 10,000 chars |
| `list_dir` | Lists a directory's immediate entries, `d`/`f` prefixed | Not recursive |

`bash`'s use of `child_process.exec` (not `spawn`) means the command string is handed to a shell
(`sh -c` on POSIX) — see
[pre-req/01-processes-and-child-processes.md](../pre-req/01-processes-and-child-processes.md) for
what that means for quoting, pipes, and why this is a real (if standard-for-this-kind-of-tool)
trust boundary the hook system exists partly to guard (default hook rules deny `rm -rf /`-shaped
and `git push --force` commands — see file 04).

## Registration order (`src/cli.ts`)

```ts
const registry = new ToolRegistry();
for (const tool of builtinTools) registry.register(tool);

const mcpConfig = await loadMcpConfig();
const mcpTools = await connectMcpServers(mcpConfig);
for (const tool of mcpTools) {
  try { registry.register(tool); }
  catch (err) { console.error(`[mcp] skipping tool "${tool.name}": ...`); }
}
```

Built-ins register first, unconditionally. MCP tools register after, and a name collision (thrown
by `register`) is caught and logged rather than crashing startup — an external server misbehaving
shouldn't take down the whole harness. In practice this can't collide with a built-in today: MCP
tools are namespaced `mcp__<server>__<tool>` before they ever reach `register` (see
[10-mcp-integration.md](10-mcp-integration.md)), specifically to make same-name collisions
structurally impossible rather than relying on this catch as the only defense.
