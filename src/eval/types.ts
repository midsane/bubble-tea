import type { ChatMessage } from "../providers/types.js";

/**
 * Prefix on the synthetic "please fix it" message the repair loop injects
 * as a user-role turn (required so the model treats it as a fresh prompt,
 * same as any other provider needs a user turn to respond to). The display
 * layer (tui/display.ts) detects this prefix so the message renders as a
 * system-generated notice rather than looking like something the user
 * actually typed.
 */
export const EVAL_FEEDBACK_MARKER = "[[eval-feedback]]";

export interface EvalResult {
  passed: boolean;
  score: number;
  feedback: string;
}

export interface NamedEvalResult extends EvalResult {
  evaluator: string;
}

export interface Evaluator {
  name: string;
  evaluate(task: string, turnMessages: ChatMessage[]): Promise<EvalResult>;
}

export async function runEvaluators(
  evaluators: Evaluator[],
  task: string,
  turnMessages: ChatMessage[]
): Promise<NamedEvalResult[]> {
  const results: NamedEvalResult[] = [];
  for (const evaluator of evaluators) {
    const result = await evaluator.evaluate(task, turnMessages);
    results.push({ ...result, evaluator: evaluator.name });
  }
  return results;
}
