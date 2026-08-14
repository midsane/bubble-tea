import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { pathToFileURL } from "node:url";
import { z } from "zod";

// Standalone MCP server (a separate process, spoken to over stdio) — this
// is the one built into bubble-tea by default. It's discovered and its
// tool registered into the same registry as builtins purely through
// ~/.bubbletea/mcp.json + src/mcp/client.ts, the same path any external
// MCP server would use; nothing here is special-cased by the harness.
//
// Backed by Wikipedia's search API rather than a general search engine:
// free, no API key, and — verified directly — reliably reachable from
// Node's fetch. (DuckDuckGo's Instant Answer API was tried first: curl
// against it returns real content, but Node's fetch/https consistently
// gets a 200 with an empty streamed body against that specific host, most
// likely anti-automation filtering on their edge reacting to Node's TLS
// fingerprint — not something worth working around for a demo-scale tool.)

const MAX_RESULTS = 5;

interface WikipediaSearchResponse {
  query?: {
    searchinfo?: { totalhits?: number };
    search?: Array<{ title: string; snippet: string; wordcount: number }>;
  };
}

const HTML_ENTITIES: Record<string, string> = {
  "&quot;": '"',
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&#39;": "'",
  "&nbsp;": " ",
};

function stripHtml(text: string): string {
  return text.replace(/<[^>]+>/g, "").replace(/&(quot|amp|lt|gt|#39|nbsp);/g, (m) => HTML_ENTITIES[m] ?? m);
}

export async function webSearch(query: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const url =
    "https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=" +
    `${MAX_RESULTS}&srsearch=${encodeURIComponent(query)}`;

  const res = await fetchImpl(url);
  if (!res.ok) {
    return `Search request failed (${res.status}).`;
  }

  const data = (await res.json()) as WikipediaSearchResponse;
  const results = data.query?.search ?? [];
  if (results.length === 0) {
    return `No results found for "${query}".`;
  }

  const totalHits = data.query?.searchinfo?.totalhits;
  const lines = [`Found ${totalHits ?? results.length} result(s) for "${query}" (showing top ${results.length}):`, ""];
  for (const r of results) {
    const pageUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/ /g, "_"))}`;
    lines.push(`- ${r.title}: ${stripHtml(r.snippet)}`);
    lines.push(`  ${pageUrl}`);
  }
  return lines.join("\n");
}

async function main() {
  const server = new McpServer({ name: "web-search", version: "1.0.0" });

  server.registerTool(
    "web_search",
    {
      description:
        "Search Wikipedia for a query and return the top matching articles with snippets and links. " +
        "Useful for looking up facts, definitions, people, places, and general knowledge. No API key required.",
      inputSchema: { query: z.string().describe("The search query.") },
    },
    async ({ query }: { query: string }) => ({
      content: [{ type: "text" as const, text: await webSearch(query) }],
    })
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Only start the MCP server when this file is run directly (as the
// spawned subprocess) — not when imported elsewhere for webSearch(), e.g.
// in tests that exercise the search-response parsing without wanting
// StdioServerTransport to take over stdin/stdout.
const isEntryPoint = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntryPoint) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
