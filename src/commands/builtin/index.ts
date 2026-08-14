import { CommandRegistry } from "../registry.js";
import { createHelpCommand } from "./help.js";
import { newCommand } from "./new.js";
import { sessionCommand } from "./session.js";

export function createCommandRegistry(): CommandRegistry {
  const registry = new CommandRegistry();
  registry.register(newCommand);
  registry.register(sessionCommand);
  registry.register(createHelpCommand(registry));
  return registry;
}
