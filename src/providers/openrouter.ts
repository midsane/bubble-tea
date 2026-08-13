import type { ChatMessage, ChatResult, Provider, ToolCall, ToolSchema } from "./types.js";

interface OpenRouterConfig {
  apiKey: string;
  model: string;
}

// OpenRouter exposes an OpenAI-compatible /chat/completions endpoint, so we
// talk to it with plain fetch rather than pulling in the openai SDK.
const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

export class OpenRouterProvider implements Provider {
  readonly name = "openrouter";
  private readonly apiKey: string;
  private readonly model: string;

  constructor(config: OpenRouterConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model;
  }

  async chat(messages: ChatMessage[], tools: ToolSchema[]): Promise<ChatResult> {
    const body = {
      model: this.model,
      messages: messages.map(toOpenAiMessage),
      tools: tools.length > 0 ? tools.map(toOpenAiTool) : undefined,
    };

    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`OpenRouter request failed (${res.status}): ${text.slice(0, 500)}`);
    }

    const json = (await res.json()) as OpenAiChatCompletion;
    const message = json.choices?.[0]?.message;
    if (!message) {
      throw new Error(`OpenRouter response had no choices: ${JSON.stringify(json).slice(0, 500)}`);
    }

    const toolCalls: ToolCall[] = (message.tool_calls ?? []).map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: safeJsonParse(tc.function.arguments),
    }));

    return { content: message.content ?? null, toolCalls };
  }
}

function toOpenAiMessage(msg: ChatMessage) {
  if (msg.role === "tool") {
    return {
      role: "tool",
      tool_call_id: msg.toolCallId,
      content: msg.content ?? "",
    };
  }
  if (msg.role === "assistant" && msg.toolCalls && msg.toolCalls.length > 0) {
    return {
      role: "assistant",
      content: msg.content,
      tool_calls: msg.toolCalls.map((tc) => ({
        id: tc.id,
        type: "function",
        function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
      })),
    };
  }
  return { role: msg.role, content: msg.content ?? "" };
}

function toOpenAiTool(tool: ToolSchema) {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  };
}

function safeJsonParse(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

interface OpenAiChatCompletion {
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: Array<{
        id: string;
        function: { name: string; arguments: string };
      }>;
    };
  }>;
}
