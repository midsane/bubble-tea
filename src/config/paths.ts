import { homedir } from "node:os";
import { join } from "node:path";

/** Machine-root config directory, mirroring ~/.claude — not project-local. */
export function configRoot(): string {
  return join(homedir(), ".bubbletea");
}

export function skillsDir(): string {
  return join(configRoot(), "skills");
}

export function agentsDir(): string {
  return join(configRoot(), "agents");
}

export function hooksDir(): string {
  return join(configRoot(), "hooks");
}

export function hooksConfigPath(): string {
  return join(hooksDir(), "config.json");
}

export function mcpConfigPath(): string {
  return join(configRoot(), "mcp.json");
}

export function sessionsDir(projectKey: string): string {
  return join(configRoot(), "sessions", projectKey);
}
