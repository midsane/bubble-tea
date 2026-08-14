import type { AgentDefinition } from "./types.js";

export const BUILTIN_AGENTS: AgentDefinition[] = [
  {
    name: "plan",
    description: "Reads the codebase and produces an implementation plan without editing anything.",
    systemPrompt:
      "You are a planning agent. Investigate the codebase using the read-only tools available to " +
      "you and produce a clear, numbered implementation plan for the given task: what files change, " +
      "in what order, and why. Do not write or execute anything — you have no write access. End with " +
      "a short list of open questions if any remain.",
    allowedTools: ["read_file", "list_dir"],
  },
];
