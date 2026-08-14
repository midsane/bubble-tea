# 10 — MCP integration

MCP (Model Context Protocol) is how bubble-tea talks to tools that live in a **separate process**,
speaking a standard JSON-RPC-ish protocol over stdio, instead of being TypeScript functions linked
into this codebase. See
[pre-req/02-stdio-pipes-and-the-mcp-protocol.md](../pre-req/02-stdio-pipes-and-the-mcp-protocol.md)
for what "speaking a protocol over stdio" means at the OS level.

## Client side: connecting and wrapping

```ts
// src/mcp/client.ts
export async function connectMcpServers(config: McpConfig): Promise<Tool[]> {
  const tools: Tool[] = [];
  for (const server of config.servers) {
    try {
      const client = new Client({ name: "bubble-tea", version: "0.1.0" }, { capabilities: {} });
      const transport = new StdioClientTransport({ command: server.command, args: server.args });
      await client.connect(transport);
      const { tools: serverTools } = await client.listTools();
      for (const t of serverTools as McpToolInfo[]) tools.push(wrapMcpTool(server, client, t));
    } catch (err) {
      console.error(`[mcp] failed to connect to server "${server.name}": ...`);
    }
  }
  return tools;
}
```

`StdioClientTransport` is what actually spawns `server.command` as a child process and wires its
stdin/stdout as the RPC channel (`@modelcontextprotocol/sdk` handles the wire format). A server
that fails to spawn or connect is logged and skipped — **not fatal to startup**, mirroring the same
"one bad component shouldn't take down the harness" posture as `src/cli.ts`'s registration loop
(see [03-tools-and-registry.md](03-tools-and-registry.md)).

```ts
function wrapMcpTool(server: McpServerConfig, client: Client, mcpTool: McpToolInfo): Tool {
  return {
    name: `mcp__${server.name}__${mcpTool.name}`,
    description: mcpTool.description ?? `MCP tool "${mcpTool.name}" from server "${server.name}"`,
    parameters: (mcpTool.inputSchema as JsonSchema) ?? { type: "object", properties: {} },
    async execute(args) {
      const result = await client.callTool({ name: mcpTool.name, arguments: args });
      const content = result.content as Array<{ type: string; text?: string }> | undefined;
      const text = content?.filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n");
      return text || JSON.stringify(result);
    },
  };
}
```

The `mcp__<server>__<tool>` naming isn't cosmetic — it's how a name collision between two servers,
or between a server and a built-in, becomes structurally impossible rather than something that just
happens not to occur today. Every wrapped tool implements the exact same `Tool` interface as a
built-in (see [03-tools-and-registry.md](03-tools-and-registry.md)); `execute` here just forwards to
`client.callTool` and flattens the MCP content-block response down to plain text. From
`ToolRegistry`'s perspective, an MCP tool and `read_file` are indistinguishable.

## Server side: three example standalone servers

`src/mcp-servers/` has three files, each a small standalone Node process using
`@modelcontextprotocol/sdk`'s server-side `McpServer` + `StdioServerTransport`:

| Server | Tool it exposes | Notes |
|---|---|---|
| `web-search.ts` | `web_search` — searches Wikipedia, returns titles/snippets/links | The only one wired into the default `~/.bubbletea/mcp.json` (seeded by `ensureConfigDirs`, see [08-config-skills-and-agents.md](08-config-skills-and-agents.md)). Uses Wikipedia's API specifically because it's free, keyless, and reliably reachable from Node's `fetch` — DuckDuckGo's Instant Answer API was tried first and silently returned empty bodies to Node's fetch, likely anti-automation filtering reacting to Node's TLS fingerprint. |
| `dice-roller.ts` | `roll_dice` — standard tabletop notation (`2d6`, `1d20+3`) | No network access; a good first file to read for "how does an MCP tool wire up" since it's the simplest one |
| `text-tools.ts` | `transform_text` — upper/lower/title/reverse/word-count | Also no network access |

`dice-roller.ts` and `text-tools.ts` are **not** in the default `mcp.json` — they exist as
additional examples you can wire in yourself by adding an entry to `~/.bubbletea/mcp.json`:

```json
{ "name": "dice-roller", "command": "node", "args": ["/absolute/path/to/dist/mcp-servers/dice-roller.js"] }
```

All three share an entry-point guard so they can be imported for their pure logic (e.g.
`webSearch()`) without accidentally starting a server and taking over the process's stdio:

```ts
const isEntryPoint = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntryPoint) { main().catch(...); }
```

## The default `mcp.json`

```ts
// src/config/ensure.ts
const WEB_SEARCH_SERVER_PATH = fileURLToPath(new URL("../mcp-servers/web-search.js", import.meta.url));
const DEFAULT_MCP_CONFIG = {
  servers: [{ name: "web-search", command: process.execPath, args: [WEB_SEARCH_SERVER_PATH] }],
};
```

`command: process.execPath` (the currently-running Node binary) plus a path resolved relative to
*this module's own compiled location* — not a hardcoded absolute path — means the seeded config
works correctly wherever bubble-tea itself ends up installed, without assuming a fixed project
directory.
