import type { Provider } from "../../providers/types.js";
import type { ToolRegistry } from "../../tools/registry.js";
import type { HooksConfig } from "../../hooks/types.js";
import type { TaskManager } from "../../agents/taskManager.js";
import { CommandRegistry } from "../registry.js";
import { createCompactCommand } from "./compact.js";
import { createHelpCommand } from "./help.js";
import { createPlanCommand } from "./plan.js";
import { createTasksCommand } from "./tasks.js";
import { newCommand } from "./new.js";
import { sessionCommand } from "./session.js";

export function createCommandRegistry(
  provider: Provider,
  toolRegistry: ToolRegistry,
  hooks: HooksConfig,
  taskManager: TaskManager
): CommandRegistry {
  const registry = new CommandRegistry();
  registry.register(newCommand);
  registry.register(sessionCommand);
  registry.register(createCompactCommand(provider));
  registry.register(createPlanCommand(provider, toolRegistry, hooks, taskManager));
  registry.register(createTasksCommand(taskManager));
  registry.register(createHelpCommand(registry));
  return registry;
}
