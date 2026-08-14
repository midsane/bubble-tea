import { readdir } from "node:fs/promises";
import { resolve } from "node:path";

export interface PathToken {
  dir: string;
  partial: string;
}

/**
 * Splits an in-progress @path token into the directory to list and the
 * partial name to filter by — "tu" -> {dir: ".", partial: "tu"}, "src/tu"
 * -> {dir: "src", partial: "tu"}, "src/" -> {dir: "src", partial: ""}.
 */
export function splitPathToken(token: string): PathToken {
  const idx = token.lastIndexOf("/");
  if (idx === -1) return { dir: ".", partial: token };
  return { dir: token.slice(0, idx) || "/", partial: token.slice(idx + 1) };
}

/**
 * Lists filesystem entries under `dir` (resolved relative to cwd) whose
 * name starts with `partial`, formatted as the path text that would
 * replace the in-progress @token — directories get a trailing "/", like
 * shell completion. Dotfiles are hidden unless the partial itself starts
 * with ".", matching conventional completion behavior. Returns [] on any
 * error (missing dir, not a directory, permissions) since this only powers
 * a live hint list, not a submitted action.
 */
export async function listPathCandidates(
  dir: string,
  partial: string,
  cwd: string = process.cwd()
): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(resolve(cwd, dir), { withFileTypes: true });
  } catch {
    return [];
  }

  const showDotfiles = partial.startsWith(".");
  const matches = entries.filter((e) => (showDotfiles || !e.name.startsWith(".")) && e.name.startsWith(partial));
  matches.sort((a, b) => {
    if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const prefix = dir === "." ? "" : `${dir}/`;
  return matches.map((e) => `${prefix}${e.name}${e.isDirectory() ? "/" : ""}`);
}
