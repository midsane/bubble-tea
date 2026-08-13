import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { Tool } from "../types.js";

export const writeFileTool: Tool = {
  name: "write_file",
  description:
    "Write content to a file, given a path relative to the current working directory. Creates parent directories and overwrites existing files.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Path to the file, relative to the working directory." },
      content: { type: "string", description: "Full content to write to the file." },
    },
    required: ["path", "content"],
  },
  async execute(args) {
    const path = String(args.path ?? "");
    if (!path) return "Error: missing required argument \"path\"";
    const content = typeof args.content === "string" ? args.content : String(args.content ?? "");

    const absolute = resolve(process.cwd(), path);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, content, "utf-8");
    return `Wrote ${content.length} chars to ${path}`;
  },
};
