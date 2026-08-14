import "dotenv/config";
import React from "react";
import { render } from "ink";
import { createProviderFromEnv, type ChatMessage } from "./providers/index.js";
import { ToolRegistry } from "./tools/registry.js";
import { builtinTools } from "./tools/builtin/index.js";
import { appendMessages, mostRecentSession, newSessionId, projectKey, readSession } from "./state/store.js";
import { resolveSession } from "./state/mapping.js";
import { buildSystemPrompt } from "./systemPrompt.js";
import { createCommandRegistry } from "./commands/builtin/index.js";
import { ensureConfigDirs } from "./config/ensure.js";
import { loadSkills } from "./config/skills.js";
import { loadHooksConfig } from "./hooks/config.js";
import { App } from "./tui/App.js";

async function main() {
  await ensureConfigDirs();
  const skills = await loadSkills();
  const hooks = await loadHooksConfig();

  const provider = createProviderFromEnv();

  const registry = new ToolRegistry();
  for (const tool of builtinTools) registry.register(tool);
  const commands = createCommandRegistry(provider);

  const key = projectKey();
  let sessionId: string;
  let messages: ChatMessage[];

  const shouldResume = process.argv.includes("--resume");
  const resumeTarget = shouldResume ? await mostRecentSession(key) : undefined;

  if (resumeTarget) {
    sessionId = resumeTarget.id;
    messages = resolveSession(await readSession(key, sessionId));
  } else {
    sessionId = newSessionId();
    messages = [{ role: "system", content: buildSystemPrompt() }];
    await appendMessages(key, sessionId, messages);
  }

  render(
    React.createElement(App, {
      provider,
      registry,
      commands,
      skills,
      hooks,
      projectKey: key,
      initialSessionId: sessionId,
      initialMessages: messages,
    })
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
