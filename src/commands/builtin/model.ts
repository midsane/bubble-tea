import { KNOWN_PROVIDERS, type ProviderRouter } from "../../providers/index.js";
import type { Command, CommandContext, CommandResult } from "../types.js";

export function createModelCommand(router: ProviderRouter): Command {
  return {
    name: "model",
    description: "Show or switch the active provider: /model [gemini|openrouter] [model-name].",
    async run(ctx: CommandContext): Promise<CommandResult> {
      const [target, modelOverride] = ctx.args;
      if (!target) {
        return {
          output: `Current: ${router.name} (${router.model})\nAvailable: ${KNOWN_PROVIDERS.join(", ")}\nUsage: /model <provider> [model-name]`,
        };
      }

      router.switch(target, modelOverride);
      return { output: `Switched to ${router.name} (${router.model}).` };
    },
  };
}
