import type { ChatMessage, Provider } from "../providers/types.js";
import type { ToolRegistry } from "../tools/registry.js";

const MAX_ITERATIONS = 25;

/**
 * Plan -> act -> observe: ask the model for a response, execute any tool
 * calls it requests, feed the results back, and repeat until it answers
 * with plain text (or the iteration budget runs out).
 *
 * Mutates `messages` in place so callers can keep using it as the running
 * session history across turns.
 */
export async function runTurn(
  provider: Provider,
  registry: ToolRegistry,
  messages: ChatMessage[]
): Promise<string> {
  const tools = registry.schemas();

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const result = await provider.chat(messages, tools);

    if (result.toolCalls.length === 0) {
      const content = result.content ?? "";
      messages.push({ role: "assistant", content });
      return content;
    }

    messages.push({ role: "assistant", content: result.content, toolCalls: result.toolCalls });

    for (const call of result.toolCalls) {
      const output = await registry.execute(call.name, call.arguments);
      messages.push({ role: "tool", content: output, toolCallId: call.id, toolName: call.name });
    }
  }

  return `Stopped after ${MAX_ITERATIONS} tool-call iterations without a final answer.`;
}
