import type { Command } from "./types.js";

/**
 * Matches registered commands against a (possibly empty) prefix the user
 * has typed after "/". Empty prefix returns every command, in registry
 * order — this is what makes typing a bare "/" show the full command menu.
 */
export function matchCommands(commands: Command[], prefix: string): Command[] {
  const lower = prefix.toLowerCase();
  return commands.filter((c) => c.name.toLowerCase().startsWith(lower));
}
