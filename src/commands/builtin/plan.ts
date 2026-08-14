import type { Provider } from "../../providers/types.js";
import type { ToolRegistry } from "../../tools/registry.js";
import type { HooksConfig } from "../../hooks/types.js";
import { loadAgentDefinitions } from "../../agents/loader.js";
import { runAgent } from "../../agents/run.js";
import type { TaskManager } from "../../agents/taskManager.js";
import type { Command, CommandContext, CommandResult } from "../types.js";

/**
 * Spawns the plan agent as a background task instead of awaiting it inline
 * — the main session stays responsive to new input while it runs, and its
 * result surfaces via TaskManager's "update" event (App.tsx pushes it into
 * the message stream) or on demand via /tasks.
 */
export function createPlanCommand(
  provider: Provider,
  registry: ToolRegistry,
  hooks: HooksConfig,
  taskManager: TaskManager
): Command {
  return {
    name: "plan",
    description: "Run the built-in plan agent on a task, in the background (see /tasks).",
    async run(ctx: CommandContext): Promise<CommandResult> {
      const task = ctx.args.join(" ");
      if (!task) return { output: "Usage: /plan <task description>" };

      const agents = await loadAgentDefinitions();
      const planAgent = agents.find((a) => a.name === "plan");
      if (!planAgent) return { output: "No 'plan' agent definition found." };

      const taskId = taskManager.start(`plan: ${task}`, async () => {
        const { sessionId, result } = await runAgent(
          planAgent,
          provider,
          registry,
          hooks,
          ctx.projectKey,
          ctx.sessionId,
          task
        );
        return `[session ${sessionId}]\n${result}`;
      });

      return { output: `Started plan agent in the background (task ${taskId}). Check /tasks or wait for it to surface here.` };
    },
  };
}
