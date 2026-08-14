import type { Command, CommandContext, CommandResult } from "../types.js";

export const exitCommand: Command = {
  name: "exit",
  description: "Exit bubble-tea.",
  async run(_ctx: CommandContext): Promise<CommandResult> {
    return { output: "Goodbye!", exit: true };
  },
};
