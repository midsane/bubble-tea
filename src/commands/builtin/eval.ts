import type { Provider } from "../../providers/types.js";
import type { ToolRegistry } from "../../tools/registry.js";
import type { HooksConfig } from "../../hooks/types.js";
import { ruleBasedEvaluator } from "../../eval/ruleBased.js";
import { createLlmJudgeEvaluator } from "../../eval/llmJudge.js";
import { evaluateAndRepair } from "../../eval/retry.js";
import type { Command, CommandContext, CommandResult } from "../types.js";

export function createEvalCommand(provider: Provider, registry: ToolRegistry, hooks: HooksConfig): Command {
  const llmJudge = createLlmJudgeEvaluator(provider);

  return {
    name: "eval",
    description: "Evaluate the last turn (add 'llm' to also use an LLM judge); retries with feedback on failure.",
    async run(ctx: CommandContext): Promise<CommandResult> {
      const evaluators = ctx.args.includes("llm") ? [ruleBasedEvaluator, llmJudge] : [ruleBasedEvaluator];

      const outcome = await evaluateAndRepair(provider, registry, hooks, evaluators, ctx.projectKey, ctx.sessionId);

      const lines = outcome.evalResults.map(
        (r) => `${r.passed ? "PASS" : "FAIL"} [${r.evaluator}] (${r.score.toFixed(2)}): ${r.feedback}`
      );
      const passed = outcome.evalResults.every((r) => r.passed);
      if (outcome.retriesUsed > 0) {
        lines.push(
          passed
            ? `Repaired after ${outcome.retriesUsed} retry(ies).`
            : `Still failing after ${outcome.retriesUsed} retry(ies) — budget exhausted.`
        );
      }

      return { output: lines.join("\n"), newMessages: outcome.messages };
    },
  };
}
