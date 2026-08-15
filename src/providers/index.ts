import { GeminiProvider } from "./gemini.js";
import { OpenRouterProvider } from "./openrouter.js";
import type { ChatMessage, ChatOptions, ChatResult, Provider, StreamEvent, ToolSchema } from "./types.js";

export * from "./types.js";

export const KNOWN_PROVIDERS = ["gemini", "openrouter"] as const;
export type ProviderName = (typeof KNOWN_PROVIDERS)[number];

function isProviderName(name: string): name is ProviderName {
  return (KNOWN_PROVIDERS as readonly string[]).includes(name);
}

function buildProvider(name: ProviderName, env: NodeJS.ProcessEnv, modelOverride?: string): { provider: Provider; model: string } {
  if (name === "gemini") {
    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY is not set (required to use "gemini")');
    const model = modelOverride ?? env.GEMINI_MODEL ?? "gemini-2.0-flash";
    return { provider: new GeminiProvider({ apiKey, model }), model };
  }

  const apiKey = env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set (required to use "openrouter")');
  const model = modelOverride ?? env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini";
  return { provider: new OpenRouterProvider({ apiKey, model }), model };
}

/**
 * A stable `Provider` whose underlying implementation can be swapped at
 * runtime (via /model) without re-plumbing every place a `Provider` was
 * handed out at startup (commands, agents, the eval judge) — they all keep
 * calling through this same object, so a switch just changes what it
 * delegates to.
 */
export class ProviderRouter implements Provider {
  private active: Provider;
  private activeModel: string;
  private readonly env: NodeJS.ProcessEnv;

  constructor(env: NodeJS.ProcessEnv, initialName: ProviderName) {
    this.env = env;
    const { provider, model } = buildProvider(initialName, env);
    this.active = provider;
    this.activeModel = model;
  }

  get name(): string {
    return this.active.name;
  }

  get model(): string {
    return this.activeModel;
  }

  /** Throws (with the missing-API-key message) rather than switching, leaving the current provider active. */
  switch(name: string, modelOverride?: string): void {
    const lower = name.toLowerCase();
    if (!isProviderName(lower)) {
      throw new Error(
        `Unknown provider "${name}" (expected one of: ${KNOWN_PROVIDERS.join(", ")}). Usage: /model <provider> [model-name]`
      );
    }
    const { provider, model } = buildProvider(lower, this.env, modelOverride);
    this.active = provider;
    this.activeModel = model;
  }

  chat(messages: ChatMessage[], tools: ToolSchema[], options?: ChatOptions): Promise<ChatResult> {
    return this.active.chat(messages, tools, options);
  }

  stream(messages: ChatMessage[], tools: ToolSchema[], options?: ChatOptions): AsyncIterable<StreamEvent> {
    return this.active.stream(messages, tools, options);
  }
}

/**
 * Gemini is the default; if its key is missing but an OpenRouter key is
 * present, start there instead so an existing OpenRouter-only setup still
 * boots (use /model to switch either way afterward).
 */
export function createProviderRouter(env: NodeJS.ProcessEnv = process.env): ProviderRouter {
  if (!env.GEMINI_API_KEY && !env.OPENROUTER_API_KEY) {
    throw new Error("Set GEMINI_API_KEY (default provider) or OPENROUTER_API_KEY in .env — neither is set.");
  }
  const initialName: ProviderName = !env.GEMINI_API_KEY && env.OPENROUTER_API_KEY ? "openrouter" : "gemini";
  return new ProviderRouter(env, initialName);
}
