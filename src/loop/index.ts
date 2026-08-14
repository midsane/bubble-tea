import type { ChatMessage, Provider } from "../providers/types.js";
import type { ToolRegistry } from "../tools/registry.js";
import { applyPostToolUse, evaluatePreToolUse } from "../hooks/pipeline.js";
import type { HooksConfig } from "../hooks/types.js";

const MAX_ITERATIONS = 25;
const EMPTY_HOOKS: HooksConfig = { rules: [] };

/**
 * Plan -> act -> observe: ask the model for a response, execute any tool
 * calls it requests, feed the results back, and repeat until it answers
 * with plain text (or the iteration budget runs out).
 *
 * Mutates `messages` in place so callers can keep using it as the running
 * session history across turns. Tool calls pass through a hook pipeline
 * (deterministic enforcement, not a suggestion the model can ignore) before
 * dispatch and after execution — a denial becomes an observation the model
 * sees, same shape as any other tool failure, rather than a thrown error.
 */
export async function runTurn(
  provider: Provider,
  registry: ToolRegistry,
  messages: ChatMessage[],
  hooks: HooksConfig = EMPTY_HOOKS
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
      const decision = evaluatePreToolUse(hooks, call.name, call.arguments);
      let output: string;
      if (!decision.allowed) {
        output = `Error: ${decision.reason}`;
      } else {
        const raw = await registry.execute(call.name, call.arguments);
        output = applyPostToolUse(hooks, call.name, raw);
      }
      messages.push({ role: "tool", content: output, toolCallId: call.id, toolName: call.name });
    }
  }

  return `Stopped after ${MAX_ITERATIONS} tool-call iterations without a final answer.`;
}
