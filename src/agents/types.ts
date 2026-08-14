export interface AgentDefinition {
  name: string;
  description: string;
  systemPrompt: string;
  /** Tool names the agent may call. Undefined = every tool the caller has registered. */
  allowedTools?: string[];
  /** Overrides the caller's provider model for this agent's runs (e.g. a cheaper/faster model for a narrow task). Undefined = caller's default. */
  model?: string;
}
