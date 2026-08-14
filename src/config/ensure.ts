import { access, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { agentsDir, hooksDir, mcpConfigPath, skillsDir } from "./paths.js";

// Resolved relative to this module's own compiled location (dist/config/)
// rather than hardcoded, so the seeded default works wherever bubble-tea
// itself is installed.
const WEB_SEARCH_SERVER_PATH = fileURLToPath(new URL("../mcp-servers/web-search.js", import.meta.url));

const DEFAULT_MCP_CONFIG = {
  servers: [{ name: "web-search", command: process.execPath, args: [WEB_SEARCH_SERVER_PATH] }],
};

/** Creates the ~/.bubbletea tree on first run: skills/, agents/, hooks/, mcp.json. */
export async function ensureConfigDirs(): Promise<void> {
  await Promise.all([
    mkdir(skillsDir(), { recursive: true }),
    mkdir(agentsDir(), { recursive: true }),
    mkdir(hooksDir(), { recursive: true }),
  ]);
  await ensureFile(mcpConfigPath(), `${JSON.stringify(DEFAULT_MCP_CONFIG, null, 2)}\n`);
}

async function ensureFile(path: string, defaultContent: string): Promise<void> {
  try {
    await access(path);
  } catch {
    await writeFile(path, defaultContent, "utf-8");
  }
}
