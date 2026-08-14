import type { CommandRegistry } from "../registry.js";
import type { Command, CommandContext, CommandResult } from "../types.js";

export function createHelpCommand(registry: CommandRegistry): Command {
  return {
    name: "help",
    description: "List available commands.",
    async run(_ctx: CommandContext): Promise<CommandResult> {
      const lines = registry
        .list()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((c) => `/${c.name} — ${c.description}`);
      return { output: lines.join("\n") };
    },
  };
}
