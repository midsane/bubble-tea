import type { HookDecision, HookRule, HooksConfig } from "./types.js";

function matches(rule: HookRule, toolName: string, subject: string): boolean {
  if (rule.matcher !== "*" && rule.matcher !== toolName) return false;
  if (!rule.pattern) return true;
  return new RegExp(rule.pattern).test(subject);
}

/** Runs before a tool call is dispatched. A matching deny rule stops execution. */
export function evaluatePreToolUse(
  config: HooksConfig,
  toolName: string,
  args: Record<string, unknown>
): HookDecision {
  const subject = JSON.stringify(args);
  for (const rule of config.rules) {
    if (rule.event !== "PreToolUse") continue;
    if (matches(rule, toolName, subject) && rule.action === "deny") {
      return { allowed: false, reason: rule.reason ?? `denied by hook rule (matcher: ${rule.matcher})` };
    }
  }
  return { allowed: true };
}

/** Runs after a tool call returns. A matching deny rule redacts the output instead of dropping the call. */
export function applyPostToolUse(config: HooksConfig, toolName: string, output: string): string {
  for (const rule of config.rules) {
    if (rule.event !== "PostToolUse") continue;
    if (matches(rule, toolName, output) && rule.action === "deny") {
      return `[output redacted by hook: ${rule.reason ?? `matcher ${rule.matcher}`}]`;
    }
  }
  return output;
}
