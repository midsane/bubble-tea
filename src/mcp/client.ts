import { readFile } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { JsonSchema } from "../providers/types.js";
import type { Tool } from "../tools/types.js";
import { mcpConfigPath } from "../config/paths.js";
import type { McpConfig, McpServerConfig } from "./types.js";

export async function loadMcpConfig(): Promise<McpConfig> {
  try {
    const raw = await readFile(mcpConfigPath(), "utf-8");
    const parsed = JSON.parse(raw) as { servers?: unknown };
    return { servers: Array.isArray(parsed.servers) ? (parsed.servers as McpServerConfig[]) : [] };
  } catch {
    return { servers: [] };
  }
}

interface McpToolInfo {
  name: string;
  description?: string;
  inputSchema: unknown;
}

/**
 * Connects to every configured MCP server over stdio and wraps each of its
 * tools as our Tool interface, namespaced `mcp__<server>__<tool>` so a name
 * collision with a builtin or another server's tool can never happen (the
 * registry throws on duplicate registration; namespacing sidesteps that
 * rather than needing a non-throwing registration path). A server that
 * fails to spawn or connect is skipped, not fatal to startup.
 */
export async function connectMcpServers(config: McpConfig): Promise<Tool[]> {
  const tools: Tool[] = [];
  for (const server of config.servers) {
    try {
      const client = new Client({ name: "bubble-tea", version: "0.1.0" }, { capabilities: {} });
      const transport = new StdioClientTransport({ command: server.command, args: server.args });
      await client.connect(transport);
      const { tools: serverTools } = await client.listTools();
      for (const t of serverTools as McpToolInfo[]) {
        tools.push(wrapMcpTool(server, client, t));
      }
    } catch (err) {
      console.error(`[mcp] failed to connect to server "${server.name}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return tools;
}

function wrapMcpTool(server: McpServerConfig, client: Client, mcpTool: McpToolInfo): Tool {
  return {
    name: `mcp__${server.name}__${mcpTool.name}`,
    description: mcpTool.description ?? `MCP tool "${mcpTool.name}" from server "${server.name}"`,
    parameters: (mcpTool.inputSchema as JsonSchema) ?? { type: "object", properties: {} },
    async execute(args) {
      const result = await client.callTool({ name: mcpTool.name, arguments: args });
      const content = result.content as Array<{ type: string; text?: string }> | undefined;
      const text = content
        ?.filter((c) => c.type === "text")
        .map((c) => c.text ?? "")
        .join("\n");
      return text || JSON.stringify(result);
    },
  };
}
