import type { ChatMessage, Provider } from "../providers/types.js";
import type { Evaluator } from "./types.js";

const RUBRIC =
  "You are a strict evaluator. Given a task and the agent's transcript for that turn, judge " +
  "whether the task was actually accomplished (not just attempted). Respond in exactly this " +
  "format, nothing else:\nSCORE: <a number between 0.0 and 1.0>\nFEEDBACK: <one sentence>";

export function createLlmJudgeEvaluator(provider: Provider): Evaluator {
  return {
    name: "llm-judge",
    async evaluate(task, turnMessages) {
      const transcript = turnMessages.map((m) => `[${m.role}] ${m.content ?? ""}`).join("\n");
      const prompt: ChatMessage[] = [
        { role: "system", content: RUBRIC },
        { role: "user", content: `TASK: ${task}\n\nTRANSCRIPT:\n${transcript}` },
      ];

      const result = await provider.chat(prompt, []);
      const text = result.content ?? "";
      const scoreMatch = /SCORE:\s*([\d.]+)/i.exec(text);
      const feedbackMatch = /FEEDBACK:\s*(.+)/is.exec(text);
      const score = scoreMatch ? Math.max(0, Math.min(1, Number.parseFloat(scoreMatch[1]))) : 0;

      return {
        passed: score >= 0.5,
        score,
        feedback: feedbackMatch ? feedbackMatch[1].trim() : text || "(no feedback returned)",
      };
    },
  };
}
