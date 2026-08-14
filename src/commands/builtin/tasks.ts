import type { TaskManager } from "../../agents/taskManager.js";
import type { Command, CommandContext, CommandResult } from "../types.js";

export function createTasksCommand(taskManager: TaskManager): Command {
  return {
    name: "tasks",
    description: "List background agent tasks and their status.",
    async run(_ctx: CommandContext): Promise<CommandResult> {
      const tasks = taskManager.list();
      if (tasks.length === 0) return { output: "No background tasks yet. Try /plan <task>." };

      const lines = tasks.map((t) => {
        const suffix = t.status === "failed" ? ` — ${t.error}` : "";
        return `${t.status === "running" ? "…" : t.status === "completed" ? "✓" : "✗"} ${t.id.slice(0, 8)}  ${t.label}${suffix}`;
      });
      return { output: lines.join("\n") };
    },
  };
}
