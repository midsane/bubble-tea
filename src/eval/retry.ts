import type { ChatMessage, Provider } from "../providers/types.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { HooksConfig } from "../hooks/types.js";
import { runTurn } from "../loop/index.js";
import { appendMessages, readSession } from "../state/store.js";
import { resolveSession } from "../state/mapping.js";
import { EVAL_FEEDBACK_MARKER, type Evaluator, type NamedEvalResult, runEvaluators } from "./types.js";

const DEFAULT_MAX_RETRIES = 2;

export interface EvaluateAndRepairOutcome {
  messages: ChatMessage[];
  evalResults: NamedEvalResult[];
  retriesUsed: number;
}

function lastTurnStart(messages: ChatMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") return i;
  }
  return 0;
}

/**
 * Evaluates the most recent turn in a session; if it fails, re-runs the
 * loop with the failure feedback attached as a follow-up user message and
 * re-evaluates, up to `maxRetries` times. Stops as soon as a pass, or
 * reports the unresolved failure once the budget runs out — never retries
 * silently forever.
 */
export async function evaluateAndRepair(
  provider: Provider,
  registry: ToolRegistry,
  hooks: HooksConfig,
  evaluators: Evaluator[],
  projectKey: string,
  sessionId: string,
  maxRetries: number = DEFAULT_MAX_RETRIES
): Promise<EvaluateAndRepairOutcome> {
  const messages = resolveSession(await readSession(projectKey, sessionId));
  let persistedCount = messages.length;

  const turnStart = lastTurnStart(messages);
  const task = messages[turnStart]?.content ?? "";

  let evalResults = await runEvaluators(evaluators, task, messages.slice(turnStart));
  let retriesUsed = 0;

  while (evalResults.some((r) => !r.passed) && retriesUsed < maxRetries) {
    const failureSummary = evalResults
      .filter((r) => !r.passed)
      .map((r) => `- ${r.evaluator}: ${r.feedback}`)
      .join("\n");
    messages.push({
      role: "user",
      content: `${EVAL_FEEDBACK_MARKER}Your previous attempt did not pass evaluation:\n${failureSummary}\nPlease fix it.`,
    });
    // Evaluate only this retry's own feedback message + response, not the
    // whole span back to the original turn — otherwise a stale tool error
    // from the attempt being repaired keeps failing every future retry.
    const retryStart = messages.length - 1;

    await runTurn(provider, registry, messages, hooks);
    await appendMessages(projectKey, sessionId, messages.slice(persistedCount));
    persistedCount = messages.length;
    retriesUsed += 1;

    evalResults = await runEvaluators(evaluators, task, messages.slice(retryStart));
  }

  return { messages, evalResults, retriesUsed };
}
