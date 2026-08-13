import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { Tool } from "../types.js";

const execAsync = promisify(exec);
const TIMEOUT_MS = 30_000;
const MAX_CHARS = 10_000;

export const bashTool: Tool = {
  name: "bash",
  description: "Run a shell command in the current working directory and return its stdout/stderr.",
  parameters: {
    type: "object",
    properties: {
      command: { type: "string", description: "Shell command to execute." },
    },
    required: ["command"],
  },
  async execute(args) {
    const command = String(args.command ?? "");
    if (!command) return "Error: missing required argument \"command\"";

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: process.cwd(),
        timeout: TIMEOUT_MS,
        maxBuffer: 10 * 1024 * 1024,
      });
      const combined = [stdout, stderr].filter(Boolean).join("\n").trim() || "(no output)";
      return truncate(combined);
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string; message: string };
      const combined = [e.stdout, e.stderr, e.message].filter(Boolean).join("\n").trim();
      return `Command failed: ${truncate(combined)}`;
    }
  },
};

function truncate(text: string): string {
  if (text.length <= MAX_CHARS) return text;
  return `${text.slice(0, MAX_CHARS)}\n\n[truncated: ${text.length} chars total]`;
}
