// Entry point: wires every layer of the harness together in dependency
// order (config dirs -> skills/agents/hooks -> provider -> tool registry ->
// MCP -> session resolve) and hands the assembled state to the Ink root
// component. See detailed-working/ for what each layer does and why it's
// ordered this way.
import "dotenv/config";
import React from "react";
import { render } from "ink";
import { createProviderRouter, type ChatMessage } from "./providers/index.js";
import { ToolRegistry } from "./tools/registry.js";
import { builtinTools } from "./tools/builtin/index.js";
import { mostRecentSession, newSessionId, projectKey, readSession } from "./state/store.js";
import { resolveSession } from "./state/mapping.js";
import { buildSystemPrompt } from "./systemPrompt.js";
import { createCommandRegistry } from "./commands/builtin/index.js";
import { ensureConfigDirs } from "./config/ensure.js";
import { loadSkills } from "./config/skills.js";
import { loadHooksConfig } from "./hooks/config.js";
import { TaskManager } from "./agents/taskManager.js";
import { loadAgentDefinitions } from "./agents/loader.js";
import { connectMcpServers, loadMcpConfig } from "./mcp/client.js";
import { App } from "./tui/App.js";

async function main() {
  await ensureConfigDirs();
  const skills = await loadSkills();
  const agents = await loadAgentDefinitions();
  const hooks = await loadHooksConfig();

  const provider = createProviderRouter();

  const registry = new ToolRegistry();
  for (const tool of builtinTools) registry.register(tool);

  const mcpConfig = await loadMcpConfig();
  const mcpTools = await connectMcpServers(mcpConfig);
  for (const tool of mcpTools) {
    try {
      registry.register(tool);
    } catch (err) {
      console.error(`[mcp] skipping tool "${tool.name}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const taskManager = new TaskManager();
  const commands = createCommandRegistry(provider, registry, hooks, taskManager);

  const key = projectKey();
  let sessionId: string;
  let messages: ChatMessage[];

  const shouldResume = process.argv.includes("--resume");
  const resumeTarget = shouldResume ? await mostRecentSession(key) : undefined;

  let initialPersistedCount: number;
  if (resumeTarget) {
    sessionId = resumeTarget.id;
    messages = resolveSession(await readSession(key, sessionId));
    initialPersistedCount = messages.length;
  } else {
    // Don't write a session file yet: it should only exist once the user
    // actually sends something, not just because the app was launched.
    sessionId = newSessionId();
    messages = [{ role: "system", content: buildSystemPrompt() }];
    initialPersistedCount = 0;
  }

  const instance = render(
    React.createElement(App, {
      provider,
      registry,
      commands,
      skills,
      agents,
      hooks,
      taskManager,
      projectKey: key,
      initialSessionId: sessionId,
      initialMessages: messages,
      initialPersistedCount,
      clearTerminal: () => instance.clear(),
    })
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
