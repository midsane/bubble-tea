# 11 — Evaluation and the repair loop

`architecture.md` asks for agent output to be "verified, scored, and **improved**" — the first two
are evaluators; the third is what turns a failing score into an actual retry, not just a report.

## Evaluators

```ts
// src/eval/types.ts
export interface Evaluator {
  name: string;
  evaluate(task: string, turnMessages: ChatMessage[]): Promise<EvalResult>;  // { passed, score, feedback }
}
```

Two implementations, both stateless and swappable behind this same interface:

**Rule-based** (`src/eval/ruleBased.ts`) — free, deterministic, no LLM call:

```ts
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
```

Deliberately checks only the *last* tool call, not every tool call in the turn — a mid-turn error
the model already noticed and recovered from isn't itself a failure; only ending on one is.

**LLM-judge** (`src/eval/llmJudge.ts`) — an extra model call with an explicit rubric, opt-in
(costs a call, so it's not the default):

```ts
const RUBRIC = "You are a strict evaluator. Given a task and the agent's transcript for that turn, judge " +
  "whether the task was actually accomplished (not just attempted). Respond in exactly this " +
  "format, nothing else:\nSCORE: <a number between 0.0 and 1.0>\nFEEDBACK: <one sentence>";
```

The response is parsed with two regexes (`/SCORE:\s*([\d.]+)/i`, `/FEEDBACK:\s*(.+)/is`); an
unparseable response degrades to `score: 0` rather than throwing. An explicit rubric plus a
constrained output format is a deliberate choice — free-form "rate this 1-10" scoring is known to
drift and to be easy for a model to game with confident-sounding prose regardless of actual
correctness.

## The retry loop

```ts
// src/eval/retry.ts
export async function evaluateAndRepair(
  provider, registry, hooks, evaluators, projectKey, sessionId, maxRetries = 2
): Promise<EvaluateAndRepairOutcome> {
  const messages = resolveSession(await readSession(projectKey, sessionId));
  const turnStart = lastTurnStart(messages);  // index of the most recent user message
  const task = messages[turnStart]?.content ?? "";

  let evalResults = await runEvaluators(evaluators, task, messages.slice(turnStart));
  let retriesUsed = 0;

  while (evalResults.some((r) => !r.passed) && retriesUsed < maxRetries) {
    const failureSummary = evalResults.filter((r) => !r.passed).map((r) => `- ${r.evaluator}: ${r.feedback}`).join("\n");
    messages.push({ role: "user", content: `${EVAL_FEEDBACK_MARKER}Your previous attempt did not pass evaluation:\n${failureSummary}\nPlease fix it.` });
    const retryStart = messages.length - 1;

    await runTurn(provider, registry, messages, hooks);
    await appendMessages(projectKey, sessionId, messages.slice(persistedCount));
    persistedCount = messages.length;
    retriesUsed += 1;

    evalResults = await runEvaluators(evaluators, task, messages.slice(retryStart));  // only this retry's span, not the original turn too
  }

  return { messages, evalResults, retriesUsed };
}
```

The synthetic feedback message is a real `role: "user"` turn — required, because every provider
needs a fresh user-role prompt to generate a fresh response; there's no "system nudge" channel
separate from the message list itself. It's marked with `EVAL_FEEDBACK_MARKER`
(`"[[eval-feedback]]"`), a prefix the display layer strips and re-renders as an `[eval retry]`
notice rather than attributing synthetic text to "you>" (see `messagesToDisplay` in
[01-end-to-end-turn.md](01-end-to-end-turn.md) step 5).

Re-evaluating only `messages.slice(retryStart)` — the new feedback message plus the fresh response
— rather than re-scanning back to the original failing turn is what prevents a permanent failure
loop: if the *original* attempt's stale tool error stayed in the evaluated span, a rule-based check
looking for "no trailing tool error" would keep failing on old evidence even after a successful
retry, and the loop would burn its whole `maxRetries` budget for nothing.

**Bounded, not silent.** `maxRetries` (default 2) caps the loop — a genuinely broken task reports
"still failing after N retry(ies) — budget exhausted" (surfaced by `/eval`, see
[07-commands-and-mentions.md](07-commands-and-mentions.md)) rather than retrying forever or quietly
giving up with no explanation.

## Invocation

There is no automatic post-task scoring — evaluation only runs when `/eval` is typed explicitly
(`src/commands/builtin/eval.ts`), which always includes the rule-based evaluator and adds the LLM
judge only if invoked as `/eval llm`.
