import type { Provider } from "../../providers/types.js";
import type { ToolRegistry } from "../../tools/registry.js";
import type { HooksConfig } from "../../hooks/types.js";
import { loadAgentDefinitions } from "../../agents/loader.js";
import { runAgent } from "../../agents/run.js";
import type { Command, CommandContext, CommandResult } from "../types.js";

export function createPlanCommand(provider: Provider, registry: ToolRegistry, hooks: HooksConfig): Command {
  return {
    name: "plan",
    description: "Run the built-in plan agent on a task, in an isolated read-only context.",
    async run(ctx: CommandContext): Promise<CommandResult> {
      const task = ctx.args.join(" ");
      if (!task) return { output: "Usage: /plan <task description>" };

      const agents = await loadAgentDefinitions();
      const planAgent = agents.find((a) => a.name === "plan");
      if (!planAgent) return { output: "No 'plan' agent definition found." };

      const { sessionId, result } = await runAgent(
        planAgent,
        provider,
        registry,
        hooks,
        ctx.projectKey,
        ctx.sessionId,
        task
      );
      return { output: `[plan agent — session ${sessionId}]\n${result}` };
    },
  };
}
