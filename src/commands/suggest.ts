import type { Command } from "./types.js";

/**
 * Case-insensitive startsWith match over any named-item list. Empty prefix
 * returns every item, in input order — this is what makes typing a bare
 * "/" or "@" show the full menu, the highest-value moment of the feature.
 */
export function matchByPrefix<T extends { name: string }>(items: T[], prefix: string): T[] {
  const lower = prefix.toLowerCase();
  return items.filter((item) => item.name.toLowerCase().startsWith(lower));
}

/** Matches registered commands against a prefix the user has typed after "/". */
export function matchCommands(commands: Command[], prefix: string): Command[] {
  return matchByPrefix(commands, prefix);
}

/**
 * Returns the in-progress "@token" the user is currently typing — an "@"
 * preceded by start-of-string or whitespace, with no following whitespace
 * yet — or undefined if there isn't one. Unlike "/" commands (which must
 * lead the whole line), "@" mentions can appear anywhere in the input, so
 * this scans for the trailing token rather than checking line-start.
 */
export function currentAtToken(value: string): string | undefined {
  const match = /(?:^|\s)@(\S*)$/.exec(value);
  return match?.[1];
}
