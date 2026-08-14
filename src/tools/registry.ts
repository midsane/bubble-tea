import type { ToolSchema } from "../providers/types.js";
import type { Tool } from "./types.js";

export class ToolRegistry {
  private readonly tools = new Map<string, Tool>();

  register(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" is already registered`);
    }
    this.tools.set(tool.name, tool);
  }

  schemas(): ToolSchema[] {
    return [...this.tools.values()].map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  /** A registry scoped to a subset of tool names — used to give a sub-agent restricted access. Undefined keeps all tools. */
  subset(names?: string[]): ToolRegistry {
    if (!names) return this;
    const scoped = new ToolRegistry();
    for (const name of names) {
      const tool = this.tools.get(name);
      if (tool) scoped.register(tool);
    }
    return scoped;
  }

  // Never throws: tool failures are handed back to the model as an
  // observation string so the loop can react instead of crashing.
  async execute(name: string, args: Record<string, unknown>): Promise<string> {
    const tool = this.tools.get(name);
    if (!tool) {
      return `Error: unknown tool "${name}"`;
    }
    try {
      return await tool.execute(args);
    } catch (err) {
      return `Error: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
}
