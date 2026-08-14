import { access, mkdir, writeFile } from "node:fs/promises";
import { agentsDir, hooksDir, mcpConfigPath, skillsDir } from "./paths.js";

/** Creates the ~/.bubbletea tree on first run: skills/, agents/, hooks/, mcp.json. */
export async function ensureConfigDirs(): Promise<void> {
  await Promise.all([
    mkdir(skillsDir(), { recursive: true }),
    mkdir(agentsDir(), { recursive: true }),
    mkdir(hooksDir(), { recursive: true }),
  ]);
  await ensureFile(mcpConfigPath(), `${JSON.stringify({ servers: [] }, null, 2)}\n`);
}

async function ensureFile(path: string, defaultContent: string): Promise<void> {
  try {
    await access(path);
  } catch {
    await writeFile(path, defaultContent, "utf-8");
  }
}
