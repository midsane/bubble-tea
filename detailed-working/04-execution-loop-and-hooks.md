# 04 — The execution loop and hooks

## `runTurn`: plan → act → observe

```ts
// src/loop/index.ts
export async function runTurn(
  provider: Provider,
  registry: ToolRegistry,
  messages: ChatMessage[],
  hooks: HooksConfig = EMPTY_HOOKS,
  chatOptions?: ChatOptions,
  onProgress?: (accumulatedText: string) => void
): Promise<string> {
  const tools = registry.schemas();

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    let result;
    for await (const event of provider.stream(messages, tools, chatOptions)) {
      if (event.type === "delta") onProgress?.(event.text);
      else result = event.result;
    }
    if (!result) throw new Error(`${provider.name}: stream ended without a "done" event`);

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
```

Key properties:

- **It mutates `messages` in place.** Callers (the TUI, agent runs, the eval retry loop) all keep
  using the same array afterward as the running session history — there's no separate "get the
  updated messages back" return value because the array *is* the state.
- **A hook denial is not an exception** — it becomes `"Error: <reason>"` pushed as the tool's
  result message, the exact same shape a real tool failure takes. The model sees "that didn't
  work" either way and can react (try something else, explain why it can't proceed) instead of the
  whole turn crashing on a policy violation.
- **Each loop iteration is its own `stream()` call**, so `onProgress`'s running-total naturally
  resets to empty at the start of the next iteration once tool results come back and the model
  starts a fresh response — the caller (`App.tsx`'s `setStreamingText`) never needs to reset
  anything itself.
- **`MAX_ITERATIONS = 25`** is a hard circuit breaker against infinite tool-call loops (a model
  stuck calling the same failing tool repeatedly). Hitting it returns an explanatory string rather
  than hanging forever.

## The hook pipeline

Two pure functions, no state, called directly inline in the loop above — this *is* the guardrail
layer, not a plugin system wrapping it:

```ts
// src/hooks/pipeline.ts
export function evaluatePreToolUse(config: HooksConfig, toolName: string, args: Record<string, unknown>): HookDecision {
  const subject = JSON.stringify(args);
  for (const rule of config.rules) {
    if (rule.event !== "PreToolUse") continue;
    if (matches(rule, toolName, subject) && rule.action === "deny") {
      return { allowed: false, reason: rule.reason ?? `denied by hook rule (matcher: ${rule.matcher})` };
    }
  }
  return { allowed: true };
}

export function applyPostToolUse(config: HooksConfig, toolName: string, output: string): string {
  for (const rule of config.rules) {
    if (rule.event !== "PostToolUse") continue;
    if (matches(rule, toolName, output) && rule.action === "deny") {
      return `[output redacted by hook: ${rule.reason ?? `matcher ${rule.matcher}`}]`;
    }
  }
  return output;
}
```

Two things worth being explicit about, because the config shape (`action: "allow" | "deny"`)
invites the wrong assumption:

- **`action: "allow"` rules are inert.** Both functions only ever act on a matching `action:
  "deny"` rule; there's no allow-list enforcement mode where anything *not* explicitly allowed gets
  blocked. The default posture is permissive — everything runs unless a deny rule matches.
- **`PostToolUse` can only redact, never modify or re-run.** A matching deny rule replaces the
  tool's entire output with a fixed `"[output redacted by hook: ...]"` string; there's no rewrite/
  transform hook.

`matches` does simple matching: `rule.matcher` is either `"*"` (every tool) or an exact tool name,
and `rule.pattern` (if present) is a regex tested against `JSON.stringify(args)` (PreToolUse) or
the raw output string (PostToolUse). No pattern means "match unconditionally" for that
matcher/event.

## Where the rules come from

```ts
// src/hooks/config.ts — default rules seeded to ~/.bubbletea/hooks/config.json on first run
{ event: "PreToolUse", matcher: "bash", pattern: "rm\\s+(-\\w*r\\w*f\\w*|-\\w*f\\w*r\\w*)\\s+/", action: "deny", reason: "..." },
{ event: "PreToolUse", matcher: "bash", pattern: "git\\s+push\\s+.*--force", action: "deny", reason: "..." },
```

`loadHooksConfig()` writes this default file only if `~/.bubbletea/hooks/config.json` doesn't
already exist (checked via `access()`), then returns it; on subsequent runs it just reads and
parses whatever's there — user edits persist. Note this is **declarative regex matching only**:
there's no arbitrary script/command execution hook, even though `~/.bubbletea/hooks/` exists as a
directory (created by `ensureConfigDirs`, but currently only ever holds `config.json`).

This is what makes a guardrail "always happens" rather than "usually happens": the model is never
asked nicely not to force-push — the harness intercepts the call before dispatch, unconditionally,
regardless of what the model's own judgment concluded.
