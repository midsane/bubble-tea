export interface ParsedFrontmatter {
  data: Record<string, string>;
  body: string;
}

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/**
 * Minimal frontmatter parser: flat `key: value` lines between `---` fences,
 * no nesting or lists. Enough for SKILL.md / agent definition headers
 * (name, description, tools) without pulling in a YAML dependency.
 */
export function parseFrontmatter(raw: string): ParsedFrontmatter {
  const match = FRONTMATTER_PATTERN.exec(raw);
  if (!match) return { data: {}, body: raw.trim() };

  const [, header, body] = match;
  const data: Record<string, string> = {};
  for (const line of header.split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key) data[key] = value;
  }
  return { data, body: body.trim() };
}
