import type { Evaluator } from "./types.js";

/**
 * Cheap, deterministic checks: did the *last* tool call in the turn fail
 * (a mid-turn error the model already recovered from is not itself a
 * failure), and did the turn actually end with a non-empty answer.
 */
export const ruleBasedEvaluator: Evaluator = {
  name: "rule-based",
  async evaluate(_task, turnMessages) {
    const toolMessages = turnMessages.filter((m) => m.role === "tool");
    const lastTool = toolMessages[toolMessages.length - 1];
    if (lastTool?.content?.startsWith("Error:")) {
      return { passed: false, score: 0, feedback: `last tool call failed: ${lastTool.content}` };
    }

    const lastAssistant = [...turnMessages].reverse().find((m) => m.role === "assistant");
    if (!lastAssistant?.content || lastAssistant.content.trim().length === 0) {
      return { passed: false, score: 0, feedback: "turn ended without a final assistant answer" };
    }

    return { passed: true, score: 1, feedback: "no trailing tool error, final answer present" };
  },
};
