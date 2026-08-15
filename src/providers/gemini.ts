import { GoogleGenAI, type Part } from "@google/genai";
import { randomUUID } from "node:crypto";
import type { ChatMessage, ChatOptions, ChatResult, Provider, StreamEvent, ToolCall, ToolSchema } from "./types.js";

interface GeminiConfig {
  apiKey: string;
  model: string;
}

// Gemini's `contents` array has no "system" role, and function results are
// sent back as role "user" with a functionResponse part (not role "tool").
// See: https://ai.google.dev/gemini-api/docs/generate-content/function-calling
export class GeminiProvider implements Provider {
  readonly name = "gemini";
  private readonly client: GoogleGenAI;
  private readonly model: string;

  constructor(config: GeminiConfig) {
    this.client = new GoogleGenAI({ apiKey: config.apiKey });
    this.model = config.model;
  }

  async chat(messages: ChatMessage[], tools: ToolSchema[], options?: ChatOptions): Promise<ChatResult> {
    const systemInstruction = messages
      .filter((m) => m.role === "system")
      .map((m) => m.content ?? "")
      .join("\n\n");

    const contents = messages.filter((m) => m.role !== "system").map(toGeminiContent);

    const response = await this.client.models.generateContent({
      model: options?.model ?? this.model,
      contents,
      config: {
        systemInstruction: systemInstruction || undefined,
        tools:
          tools.length > 0
            ? [{ functionDeclarations: tools.map(toGeminiFunctionDeclaration) }]
            : undefined,
      },
    });

    const { text, toolCalls } = extractFromParts(response.candidates?.[0]?.content?.parts ?? []);
    return { content: text || null, toolCalls };
  }

  async *stream(messages: ChatMessage[], tools: ToolSchema[], options?: ChatOptions): AsyncIterable<StreamEvent> {
    const systemInstruction = messages
      .filter((m) => m.role === "system")
      .map((m) => m.content ?? "")
      .join("\n\n");

    const contents = messages.filter((m) => m.role !== "system").map(toGeminiContent);

    const chunks = await this.client.models.generateContentStream({
      model: options?.model ?? this.model,
      contents,
      config: {
        systemInstruction: systemInstruction || undefined,
        tools:
          tools.length > 0
            ? [{ functionDeclarations: tools.map(toGeminiFunctionDeclaration) }]
            : undefined,
      },
    });

    // Gemini emits whole parts per chunk (no partial function-call arg
    // fragments to reassemble, unlike OpenAI-style streaming), so tool
    // calls just accumulate as complete objects as they arrive.
    let content = "";
    const toolCalls: ToolCall[] = [];
    for await (const chunk of chunks) {
      const extracted = extractFromParts(chunk.candidates?.[0]?.content?.parts ?? []);
      if (extracted.text) {
        content += extracted.text;
        yield { type: "delta", text: content };
      }
      toolCalls.push(...extracted.toolCalls);
    }

    yield { type: "done", result: { content: content || null, toolCalls } };
  }
}

function extractFromParts(parts: Part[]): { text: string; toolCalls: ToolCall[] } {
  const text = parts
    .filter((p): p is { text: string } => typeof p.text === "string")
    .map((p) => p.text)
    .join("");
  const toolCalls: ToolCall[] = parts
    .filter(
      (
        p
      ): p is {
        functionCall: { name: string; args?: Record<string, unknown>; id?: string };
        thoughtSignature?: string;
      } => p.functionCall !== undefined
    )
    .map((p) => ({
      id: p.functionCall.id ?? randomUUID(),
      name: p.functionCall.name,
      arguments: p.functionCall.args ?? {},
      thoughtSignature: p.thoughtSignature,
    }));
  return { text, toolCalls };
}

function toGeminiContent(msg: ChatMessage) {
  if (msg.role === "tool") {
    return {
      role: "user",
      parts: [
        {
          functionResponse: {
            name: msg.toolName ?? "unknown",
            id: msg.toolCallId,
            response: { result: msg.content ?? "" },
          },
        },
      ],
    };
  }

  if (msg.role === "assistant" && msg.toolCalls && msg.toolCalls.length > 0) {
    const parts: Array<Record<string, unknown>> = [];
    if (msg.content) parts.push({ text: msg.content });
    for (const tc of msg.toolCalls) {
      parts.push({
        functionCall: { name: tc.name, args: tc.arguments, id: tc.id },
        ...(tc.thoughtSignature ? { thoughtSignature: tc.thoughtSignature } : {}),
      });
    }
    return { role: "model", parts };
  }

  return {
    role: msg.role === "assistant" ? "model" : "user",
    parts: [{ text: msg.content ?? "" }],
  };
}

function toGeminiFunctionDeclaration(tool: ToolSchema) {
  return {
    name: tool.name,
    description: tool.description,
    // JsonSchema is a loose passthrough type; the SDK's stricter `Schema`
    // type describes the same JSON Schema shape our tools already emit.
    parameters: tool.parameters as Record<string, unknown>,
  };
}
