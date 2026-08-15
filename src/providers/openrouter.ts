import { Readable } from "node:stream";
import type { ChatMessage, ChatOptions, ChatResult, Provider, StreamEvent, ToolCall, ToolSchema } from "./types.js";

interface OpenRouterConfig {
  apiKey: string;
  model: string;
}

// OpenRouter exposes an OpenAI-compatible /chat/completions endpoint, so we
// talk to it with plain fetch rather than pulling in the openai SDK.
const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

// Node's fetch throws a bare `TypeError: fetch failed` for any network-level
// failure (DNS, connection refused/reset, TLS, timeout) with the actual
// reason buried in `err.cause` — which is dropped by default, leaving
// "fetch failed" as the only thing a caller ever sees. Surface the cause
// (unwrapping AggregateError's multiple dual-stack attempts too) so it's
// actually diagnosable.
async function fetchOrThrow(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (err) {
    throw new Error(`OpenRouter request to ${url} failed: ${describeNetworkError(err)}`, { cause: err });
  }
}

function describeNetworkError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const cause = (err as { cause?: unknown }).cause;
  if (cause === undefined) return err.message;
  if (cause instanceof AggregateError) {
    return cause.errors.map(describeNetworkError).join("; ");
  }
  if (cause instanceof Error) {
    const code = (cause as NodeJS.ErrnoException).code;
    return code ? `${code}: ${cause.message}` : cause.message;
  }
  return String(cause);
}

export class OpenRouterProvider implements Provider {
  readonly name = "openrouter";
  private readonly apiKey: string;
  private readonly model: string;

  constructor(config: OpenRouterConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model;
  }

  async chat(messages: ChatMessage[], tools: ToolSchema[], options?: ChatOptions): Promise<ChatResult> {
    const body = {
      model: options?.model ?? this.model,
      messages: messages.map(toOpenAiMessage),
      tools: tools.length > 0 ? tools.map(toOpenAiTool) : undefined,
    };

    const res = await fetchOrThrow(ENDPOINT, {
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

  async *stream(messages: ChatMessage[], tools: ToolSchema[], options?: ChatOptions): AsyncIterable<StreamEvent> {
    const body = {
      model: options?.model ?? this.model,
      messages: messages.map(toOpenAiMessage),
      tools: tools.length > 0 ? tools.map(toOpenAiTool) : undefined,
      stream: true,
    };

    const res = await fetchOrThrow(ENDPOINT, {
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
    if (!res.body) {
      throw new Error("OpenRouter streaming response had no body");
    }

    let content = "";
    // Tool call deltas arrive as fragments keyed by array index — id and
    // function.name usually land in the first fragment for that index,
    // function.arguments streams in piecewise and has to be concatenated.
    const toolCallsByIndex = new Map<number, { id: string; name: string; args: string }>();

    let buffer = "";
    for await (const chunk of Readable.fromWeb(res.body as never)) {
      buffer += (chunk as Buffer).toString("utf-8");
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? ""; // keep the last, possibly-incomplete line

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice("data: ".length).trim();
        if (payload === "[DONE]") continue;

        const parsed = safeJsonParse<OpenAiStreamChunk>(payload);
        const delta = parsed.choices?.[0]?.delta;
        if (!delta) continue;

        if (delta.content) {
          content += delta.content;
          yield { type: "delta", text: content };
        }

        for (const tc of delta.tool_calls ?? []) {
          const existing = toolCallsByIndex.get(tc.index) ?? { id: "", name: "", args: "" };
          if (tc.id) existing.id = tc.id;
          if (tc.function?.name) existing.name = tc.function.name;
          if (tc.function?.arguments) existing.args += tc.function.arguments;
          toolCallsByIndex.set(tc.index, existing);
        }
      }
    }

    const toolCalls: ToolCall[] = [...toolCallsByIndex.values()].map((tc) => ({
      id: tc.id,
      name: tc.name,
      arguments: safeJsonParse(tc.args),
    }));

    yield { type: "done", result: { content: content || null, toolCalls } };
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

function safeJsonParse<T = Record<string, unknown>>(raw: string): T {
  try {
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === "object" ? parsed : {}) as T;
  } catch {
    return {} as T;
  }
}

interface OpenAiStreamChunk {
  choices?: Array<{
    delta?: {
      content?: string | null;
      tool_calls?: Array<{
        index: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
  }>;
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
