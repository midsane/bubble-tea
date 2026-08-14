export interface AgentDefinition {
  name: string;
  description: string;
  systemPrompt: string;
  /** Tool names the agent may call. Undefined = every tool the caller has registered. */
  allowedTools?: string[];
}
