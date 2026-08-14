import type { Provider } from "../../providers/types.js";
import { compactSession } from "../../state/compact.js";
import type { Command, CommandContext, CommandResult } from "../types.js";

export function createCompactCommand(provider: Provider): Command {
  return {
    name: "compact",
    description: "Summarize older turns in this session to free up context.",
    async run(ctx: CommandContext): Promise<CommandResult> {
      const outcome = await compactSession(provider, ctx.projectKey, ctx.sessionId);
      if (!outcome) {
        return { output: "Nothing to compact yet — not enough history." };
      }
      return {
        output: `Compacted ${outcome.summarizedCount} earlier message(s) into a summary.`,
        newMessages: outcome.messages,
      };
    },
  };
}
