import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { SkillDefinition } from "../config/skills.js";

const MENTION_PATTERN = /@([^\s]+)/g;
const MAX_CHARS = 50_000;

/**
 * Finds @path and @skill-name mentions in raw user input and appends their
 * content as fenced blocks after the original text (not substituted inline
 * — that breaks down with multiple mentions or paths containing "@"-like
 * text). A mention resolves to a skill first (exact name match); anything
 * else is treated as a file path. Returns the input unchanged if there are
 * no mentions.
 */
export async function expandMentions(input: string, skills: SkillDefinition[] = []): Promise<string> {
  const tokens = [...input.matchAll(MENTION_PATTERN)].map((m) => m[1]);
  if (tokens.length === 0) return input;

  const skillByName = new Map(skills.map((s) => [s.name, s]));
  const blocks = await Promise.all(tokens.map((t) => renderMentionBlock(t, skillByName)));
  return `${input}\n\n${blocks.join("\n\n")}`;
}

function renderMentionBlock(token: string, skillByName: Map<string, SkillDefinition>): Promise<string> {
  const skill = skillByName.get(token);
  if (skill) {
    return Promise.resolve(`@${token} (skill — ${skill.description}):\n\`\`\`\n${skill.body}\n\`\`\``);
  }
  return renderFileBlock(token);
}

async function renderFileBlock(path: string): Promise<string> {
  try {
    const absolute = resolve(process.cwd(), path);
    let content = await readFile(absolute, "utf-8");
    if (content.length > MAX_CHARS) {
      content = `${content.slice(0, MAX_CHARS)}\n\n[truncated: ${content.length} chars total]`;
    }
    return `@${path}:\n\`\`\`\n${content}\n\`\`\``;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return `@${path}: [error reading file: ${message}]`;
  }
}
