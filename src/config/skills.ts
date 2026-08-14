import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseFrontmatter } from "./frontmatter.js";
import { skillsDir } from "./paths.js";

export interface SkillDefinition {
  name: string;
  description: string;
  body: string;
}

/** Discovers SKILL.md packs under ~/.bubbletea/skills/. Missing dir -> no skills. */
export async function loadSkills(): Promise<SkillDefinition[]> {
  let entries: string[];
  try {
    entries = await readdir(skillsDir());
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }

  const skills: SkillDefinition[] = [];
  for (const entry of entries) {
    let raw: string;
    try {
      raw = await readFile(join(skillsDir(), entry, "SKILL.md"), "utf-8");
    } catch {
      continue;
    }
    const { data, body } = parseFrontmatter(raw);
    skills.push({ name: data.name ?? entry, description: data.description ?? "", body });
  }
  return skills;
}
