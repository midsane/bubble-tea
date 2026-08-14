import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { pathToFileURL } from "node:url";
import { z } from "zod";

// Sample standalone MCP server, same shape as web-search.ts and
// dice-roller.ts: a separate stdio process discovered via
// ~/.bubbletea/mcp.json. Pure string manipulation, no network access.

const MODES = ["upper", "lower", "title", "reverse", "word_count"] as const;
type Mode = (typeof MODES)[number];

export function transformText(text: string, mode: Mode): string {
  switch (mode) {
    case "upper":
      return text.toUpperCase();
    case "lower":
      return text.toLowerCase();
    case "title":
      return text.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
    case "reverse":
      return [...text].reverse().join("");
    case "word_count": {
      const words = text.trim().split(/\s+/).filter(Boolean);
      return `${words.length} word(s), ${text.length} character(s)`;
    }
  }
}

async function main() {
  const server = new McpServer({ name: "text-tools", version: "1.0.0" });

  server.registerTool(
    "transform_text",
    {
      description:
        "Transform text: uppercase, lowercase, title case, reverse, or word/character count. " +
        "Useful as a lightweight example tool with no external dependencies.",
      inputSchema: {
        text: z.string().describe("The text to transform."),
        mode: z.enum(MODES).describe("Transformation to apply: upper, lower, title, reverse, or word_count."),
      },
    },
    async ({ text, mode }: { text: string; mode: Mode }) => ({
      content: [{ type: "text" as const, text: transformText(text, mode) }],
    })
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

const isEntryPoint = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntryPoint) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
