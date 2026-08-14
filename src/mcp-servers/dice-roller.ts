import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { pathToFileURL } from "node:url";
import { z } from "zod";

// Sample standalone MCP server, same shape as web-search.ts: a separate
// stdio process discovered via ~/.bubbletea/mcp.json. No network calls, so
// it's a good one to poke at first when exploring how MCP tools wire up.

const NOTATION = /^(\d*)d(\d+)([+-]\d+)?$/i;

export interface RollResult {
  notation: string;
  rolls: number[];
  modifier: number;
  total: number;
}

export function rollDice(notation: string): RollResult {
  const match = NOTATION.exec(notation.trim());
  if (!match) {
    throw new Error(`Invalid dice notation "${notation}". Expected something like "2d6" or "1d20+3".`);
  }
  const count = match[1] ? parseInt(match[1], 10) : 1;
  const sides = parseInt(match[2], 10);
  const modifier = match[3] ? parseInt(match[3], 10) : 0;

  if (count < 1 || count > 100) throw new Error("Dice count must be between 1 and 100.");
  if (sides < 2 || sides > 1000) throw new Error("Dice sides must be between 2 and 1000.");

  const rolls = Array.from({ length: count }, () => 1 + Math.floor(Math.random() * sides));
  const total = rolls.reduce((sum, r) => sum + r, 0) + modifier;

  return { notation: notation.trim(), rolls, modifier, total };
}

function formatResult(result: RollResult): string {
  const lines = [`Rolled ${result.notation}: [${result.rolls.join(", ")}]`];
  if (result.modifier !== 0) {
    lines.push(`Modifier: ${result.modifier >= 0 ? "+" : ""}${result.modifier}`);
  }
  lines.push(`Total: ${result.total}`);
  return lines.join("\n");
}

async function main() {
  const server = new McpServer({ name: "dice-roller", version: "1.0.0" });

  server.registerTool(
    "roll_dice",
    {
      description:
        'Roll dice using standard tabletop notation, e.g. "2d6", "1d20+3", "4d8-1". ' +
        "Returns each individual roll plus the total. No API key or network access required.",
      inputSchema: { notation: z.string().describe('Dice notation, e.g. "2d6" or "1d20+3".') },
    },
    async ({ notation }: { notation: string }) => ({
      content: [{ type: "text" as const, text: formatResult(rollDice(notation)) }],
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
