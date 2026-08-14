export type HookEvent = "PreToolUse" | "PostToolUse";
export type HookAction = "allow" | "deny";

export interface HookRule {
  event: HookEvent;
  /** Tool name to match, or "*" for all tools. */
  matcher: string;
  /**
   * Regex tested against JSON.stringify(args) for PreToolUse, or against the
   * tool's raw output string for PostToolUse. Omit to match unconditionally.
   */
  pattern?: string;
  action: HookAction;
  reason?: string;
}

export interface HooksConfig {
  rules: HookRule[];
}

export interface HookDecision {
  allowed: boolean;
  reason?: string;
}
