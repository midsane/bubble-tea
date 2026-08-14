import type { Command } from "./types.js";

export class CommandRegistry {
  private readonly commands = new Map<string, Command>();

  register(cmd: Command): void {
    if (this.commands.has(cmd.name)) {
      throw new Error(`Command "${cmd.name}" is already registered`);
    }
    this.commands.set(cmd.name, cmd);
  }

  list(): Command[] {
    return [...this.commands.values()];
  }

  get(name: string): Command | undefined {
    return this.commands.get(name);
  }
}

export interface ParsedCommand {
  name: string;
  args: string[];
}

export function parseCommand(input: string): ParsedCommand | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) return null;
  const parts = trimmed.slice(1).split(/\s+/).filter((p) => p.length > 0);
  const name = parts[0] ?? "";
  return { name, args: parts.slice(1) };
}
