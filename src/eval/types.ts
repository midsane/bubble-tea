import type { ChatMessage } from "../providers/types.js";

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
