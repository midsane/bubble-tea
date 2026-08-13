import { GeminiProvider } from "./gemini.js";
import { OpenRouterProvider } from "./openrouter.js";
import type { Provider } from "./types.js";

export * from "./types.js";

export function createProviderFromEnv(env: NodeJS.ProcessEnv = process.env): Provider {
  const name = (env.PROVIDER ?? "openrouter").toLowerCase();

  if (name === "openrouter") {
    const apiKey = env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error("OPENROUTER_API_KEY is not set (required when PROVIDER=openrouter)");
    }
    return new OpenRouterProvider({
      apiKey,
      model: env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini",
    });
  }

  if (name === "gemini") {
    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not set (required when PROVIDER=gemini)");
    }
    return new GeminiProvider({
      apiKey,
      model: env.GEMINI_MODEL ?? "gemini-2.0-flash",
    });
  }

  throw new Error(`Unknown PROVIDER "${name}" (expected "openrouter" or "gemini")`);
}
