import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { agentsDir } from "../config/paths.js";
import { parseFrontmatter } from "../config/frontmatter.js";
import { BUILTIN_AGENTS } from "./builtin.js";
import type { AgentDefinition } from "./types.js";

/**
 * Loads agent definitions: built-ins first, then user-defined *.md files
 * under ~/.bubbletea/agents/ (a user definition with the same name replaces
 * the built-in, so `plan` can be customized without editing source).
 */
export async function loadAgentDefinitions(): Promise<AgentDefinition[]> {
  const byName = new Map(BUILTIN_AGENTS.map((a) => [a.name, a]));

  let files: string[];
  try {
    files = (await readdir(agentsDir())).filter((f) => f.endsWith(".md"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") files = [];
    else throw err;
  }

  for (const file of files) {
    const raw = await readFile(join(agentsDir(), file), "utf-8");
    const { data, body } = parseFrontmatter(raw);
    const name = data.name ?? file.replace(/\.md$/, "");
    byName.set(name, {
      name,
      description: data.description ?? "",
      systemPrompt: body,
      allowedTools: data.tools ? data.tools.split(",").map((t) => t.trim()).filter(Boolean) : undefined,
      model: data.model || undefined,
    });
  }

  return [...byName.values()];
}
