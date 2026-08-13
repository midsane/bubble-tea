import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import type { Tool } from "../types.js";

export const listDirTool: Tool = {
  name: "list_dir",
  description: "List files and directories at a given path relative to the working directory (defaults to \".\").",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Directory to list, relative to the working directory. Defaults to \".\"." },
    },
  },
  async execute(args) {
    const path = typeof args.path === "string" && args.path.length > 0 ? args.path : ".";
    const absolute = resolve(process.cwd(), path);
    const entries = await readdir(absolute, { withFileTypes: true });
    if (entries.length === 0) return "(empty directory)";
    return entries
      .map((e) => `${e.isDirectory() ? "d" : "f"} ${e.name}`)
      .sort()
      .join("\n");
  },
};
