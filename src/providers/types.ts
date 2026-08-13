export type Role = "system" | "user" | "assistant" | "tool";

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ChatMessage {
  role: Role;
  content: string | null;
  /** set on assistant messages that invoked tools */
  toolCalls?: ToolCall[];
  /** set on tool-result messages, must match the originating ToolCall.id */
  toolCallId?: string;
  /** set on tool-result messages */
  toolName?: string;
}

export interface JsonSchema {
  type: string;
  properties?: Record<string, unknown>;
  required?: string[];
  [key: string]: unknown;
}

export interface ToolSchema {
  name: string;
  description: string;
  parameters: JsonSchema;
}

export interface ChatResult {
  content: string | null;
  toolCalls: ToolCall[];
}

export interface Provider {
  readonly name: string;
  chat(messages: ChatMessage[], tools: ToolSchema[]): Promise<ChatResult>;
}
