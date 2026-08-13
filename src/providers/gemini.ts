import { GoogleGenAI } from "@google/genai";
import { randomUUID } from "node:crypto";
import type { ChatMessage, ChatResult, Provider, ToolCall, ToolSchema } from "./types.js";

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

  async chat(messages: ChatMessage[], tools: ToolSchema[]): Promise<ChatResult> {
    const systemInstruction = messages
      .filter((m) => m.role === "system")
      .map((m) => m.content ?? "")
      .join("\n\n");

    const contents = messages.filter((m) => m.role !== "system").map(toGeminiContent);

    const response = await this.client.models.generateContent({
      model: this.model,
      contents,
      config: {
        systemInstruction: systemInstruction || undefined,
        tools:
          tools.length > 0
            ? [{ functionDeclarations: tools.map(toGeminiFunctionDeclaration) }]
            : undefined,
      },
    });

    const parts = response.candidates?.[0]?.content?.parts ?? [];
    const textParts = parts
      .filter((p): p is { text: string } => typeof p.text === "string")
      .map((p) => p.text);
    const toolCalls: ToolCall[] = parts
      .filter((p): p is { functionCall: { name: string; args?: Record<string, unknown>; id?: string } } =>
        p.functionCall !== undefined
      )
      .map((p) => ({
        id: p.functionCall.id ?? randomUUID(),
        name: p.functionCall.name,
        arguments: p.functionCall.args ?? {},
      }));

    return {
      content: textParts.length > 0 ? textParts.join("") : null,
      toolCalls,
    };
  }
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
      parts.push({ functionCall: { name: tc.name, args: tc.arguments, id: tc.id } });
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
