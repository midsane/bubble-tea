import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const MENTION_PATTERN = /@([^\s]+)/g;
const MAX_CHARS = 50_000;

/**
 * Finds @path mentions in raw user input and appends their file contents as
 * fenced blocks after the original text (not substituted inline — that
 * breaks down with multiple mentions or paths containing "@"-like text).
 * Returns the input unchanged if there are no mentions.
 */
export async function expandFileMentions(input: string): Promise<string> {
  const paths = [...input.matchAll(MENTION_PATTERN)].map((m) => m[1]);
  if (paths.length === 0) return input;

  const blocks = await Promise.all(paths.map((p) => renderFileBlock(p)));
  return `${input}\n\n${blocks.join("\n\n")}`;
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
