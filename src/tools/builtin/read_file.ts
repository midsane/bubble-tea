import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Tool } from "../types.js";

const MAX_CHARS = 50_000;

export const readFileTool: Tool = {
  name: "read_file",
  description: "Read the contents of a file, given a path relative to the current working directory.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Path to the file, relative to the working directory." },
    },
    required: ["path"],
  },
  async execute(args) {
    const path = String(args.path ?? "");
    if (!path) return "Error: missing required argument \"path\"";

    const absolute = resolve(process.cwd(), path);
    const content = await readFile(absolute, "utf-8");
    if (content.length > MAX_CHARS) {
      return `${content.slice(0, MAX_CHARS)}\n\n[truncated: file has ${content.length} chars, showing first ${MAX_CHARS}]`;
    }
    return content;
  },
};
