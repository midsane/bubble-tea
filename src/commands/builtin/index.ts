import type { Provider } from "../../providers/types.js";
import { CommandRegistry } from "../registry.js";
import { createCompactCommand } from "./compact.js";
import { createHelpCommand } from "./help.js";
import { newCommand } from "./new.js";
import { sessionCommand } from "./session.js";

export function createCommandRegistry(provider: Provider): CommandRegistry {
  const registry = new CommandRegistry();
  registry.register(newCommand);
  registry.register(sessionCommand);
  registry.register(createCompactCommand(provider));
  registry.register(createHelpCommand(registry));
  return registry;
}
