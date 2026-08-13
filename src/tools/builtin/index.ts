import { bashTool } from "./bash.js";
import { listDirTool } from "./list_dir.js";
import { readFileTool } from "./read_file.js";
import { writeFileTool } from "./write_file.js";

export const builtinTools = [readFileTool, writeFileTool, bashTool, listDirTool];
