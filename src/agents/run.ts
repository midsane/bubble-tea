import type { ChatMessage, Provider } from "../providers/types.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { HooksConfig } from "../hooks/types.js";
import { runTurn } from "../loop/index.js";
import { appendMessages, newSessionId } from "../state/store.js";
import type { AgentDefinition } from "./types.js";

export interface AgentRunResult {
  sessionId: string;
  result: string;
}

/**
 * Runs an agent definition against a task in an isolated context — fresh
 * message history (no access to the caller's conversation) and tool access
 * scoped to `definition.allowedTools` — and persists it as its own session
 * linked to the caller via parentSessionId, never appended to the caller's
 * own transcript.
 */
export async function runAgent(
  definition: AgentDefinition,
  provider: Provider,
  registry: ToolRegistry,
  hooks: HooksConfig,
  projectKey: string,
  parentSessionId: string,
  task: string
): Promise<AgentRunResult> {
  const sessionId = newSessionId();
  const scopedRegistry = registry.subset(definition.allowedTools);
  const messages: ChatMessage[] = [
    { role: "system", content: definition.systemPrompt },
    { role: "user", content: task },
  ];

  await appendMessages(projectKey, sessionId, messages, parentSessionId);
  const result = await runTurn(provider, scopedRegistry, messages, hooks);
  await appendMessages(projectKey, sessionId, messages.slice(2), parentSessionId);

  return { sessionId, result };
}
