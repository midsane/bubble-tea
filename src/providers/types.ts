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

export interface ChatOptions {
  /** Overrides the provider's configured default model for this call only (e.g. a sub-agent running on a cheaper model). */
  model?: string;
}

/**
 * Emitted while a streamed response is generating: "delta" carries the
 * running total of text produced *by this call* so far (not just the new
 * fragment) so a consumer can always just render the latest event rather
 * than accumulating itself; "done" carries the same shape chat() resolves
 * with, exactly once, always last — tool calls are not streamed
 * incrementally (most providers finalize them as complete objects), only
 * text is.
 */
export type StreamEvent = { type: "delta"; text: string } | { type: "done"; result: ChatResult };

export interface Provider {
  readonly name: string;
  chat(messages: ChatMessage[], tools: ToolSchema[], options?: ChatOptions): Promise<ChatResult>;
  stream(messages: ChatMessage[], tools: ToolSchema[], options?: ChatOptions): AsyncIterable<StreamEvent>;
}
