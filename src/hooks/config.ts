import { access, readFile, writeFile } from "node:fs/promises";
import { hooksConfigPath } from "../config/paths.js";
import type { HooksConfig } from "./types.js";

const DEFAULT_CONFIG: HooksConfig = {
  rules: [
    {
      event: "PreToolUse",
      matcher: "bash",
      pattern: "rm\\s+(-\\w*r\\w*f\\w*|-\\w*f\\w*r\\w*)\\s+/",
      action: "deny",
      reason: "recursive delete of a root path is blocked by default guardrails",
    },
    {
      event: "PreToolUse",
      matcher: "bash",
      pattern: "git\\s+push\\s+.*--force",
      action: "deny",
      reason: "force-push is blocked by default guardrails",
    },
  ],
};

/**
 * Loads ~/.bubbletea/hooks/config.json, seeding it with a small set of deny
 * rules on first run (deterministic enforcement — see PreToolUse in
 * loop/index.ts — rather than relying on the model to police itself).
 */
export async function loadHooksConfig(): Promise<HooksConfig> {
  const path = hooksConfigPath();
  try {
    await access(path);
  } catch {
    await writeFile(path, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`, "utf-8");
    return DEFAULT_CONFIG;
  }
  const raw = await readFile(path, "utf-8");
  return JSON.parse(raw) as HooksConfig;
}
