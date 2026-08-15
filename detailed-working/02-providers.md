# 02 — Providers

`src/providers/` unifies two very different model APIs — Gemini and OpenRouter — behind one
interface, so nothing above this layer (the loop, the TUI, agents, eval) needs to know or care
which one is active.

## The interface

```ts
// src/providers/types.ts
export interface Provider {
  readonly name: string;
  chat(messages: ChatMessage[], tools: ToolSchema[], options?: ChatOptions): Promise<ChatResult>;
  stream(messages: ChatMessage[], tools: ToolSchema[], options?: ChatOptions): AsyncIterable<StreamEvent>;
}
```

`ChatMessage` is the provider-facing message shape (`role`, `content`, optional `toolCalls` /
`toolCallId` / `toolName`) — deliberately distinct from the persisted `TranscriptRecord` type (see
[05-state-and-sessions.md](05-state-and-sessions.md)), which carries id/session/timestamp
concerns a wire message doesn't need.

`StreamEvent` is either `{ type: "delta", text }` (the *running total* of text produced by this
call so far, not just the new fragment — so a consumer just renders the latest event) or exactly
one final `{ type: "done", result }` with the same shape `chat()` resolves to. Tool calls are never
streamed incrementally at this interface's level — even OpenRouter's fragment-by-fragment tool-call
deltas get fully reassembled before the `"done"` event fires.

## Selecting a provider

There's no `PROVIDER` env var anymore — `createProviderRouter()` picks a starting provider (Gemini
by default; OpenRouter if only `OPENROUTER_API_KEY` is set) and returns a `ProviderRouter`, a
`Provider` whose underlying implementation can be swapped at runtime:

```ts
// src/providers/index.ts
export class ProviderRouter implements Provider {
  private active: Provider;
  get name(): string { return this.active.name; }
  switch(name: string, modelOverride?: string): void { this.active = buildProvider(...).provider; }
  chat(...) { return this.active.chat(...); }
  stream(...) { return this.active.stream(...); }
}
```

`src/cli.ts` builds this router once and hands the *same object* to the TUI, the command registry,
and agents — everything holds a reference to the router, not to a specific `GeminiProvider` or
`OpenRouterProvider`, so a switch is invisible to all of them. The `/model` command
(`src/commands/builtin/model.ts`) is the only thing that calls `.switch()`; with no args it reports
the current provider/model, with args (`/model openrouter`, `/model gemini gemini-1.5-pro`) it
switches, throwing (surfaced by the TUI as a `[error]` notice) if the target provider's API key
isn't set.

Caveat: switching mid-session doesn't translate history between providers. In particular, Gemini
rejects a tool-call replay that's missing its `thoughtSignature` (see `ToolCall.thoughtSignature` in
`src/providers/types.ts`) — switching *to* Gemini in a session whose tool calls were made by
OpenRouter can 400 on the next turn. `/model` doesn't attempt to fix this; start a fresh session
(`/new`) after switching providers if you hit it.

## Gemini adapter

`GoogleGenAI`'s `contents` array has no `"system"` role and no `"tool"` role — both are
translated:

```ts
// src/providers/gemini.ts
const systemInstruction = messages.filter((m) => m.role === "system").map((m) => m.content ?? "").join("\n\n");
const contents = messages.filter((m) => m.role !== "system").map(toGeminiContent);
```

- System messages are pulled out entirely and passed as `config.systemInstruction`, not left in
  `contents`.
- A tool-result message (`role: "tool"`) becomes `role: "user"` with a `functionResponse` part —
  Gemini has no dedicated tool-result role.
- An assistant message with tool calls becomes `role: "model"` with one `functionCall` part per
  call (plus a `text` part if there's also prose).

Streaming works differently from OpenRouter's fragment reassembly: Gemini emits **whole parts per
chunk** — no partial function-call argument fragments to stitch together — so tool calls just
accumulate as complete objects as they arrive:

```ts
for await (const chunk of chunks) {
  const extracted = extractFromParts(chunk.candidates?.[0]?.content?.parts ?? []);
  if (extracted.text) { content += extracted.text; yield { type: "delta", text: content }; }
  toolCalls.push(...extracted.toolCalls);
}
yield { type: "done", result: { content: content || null, toolCalls } };
```

## OpenRouter adapter

OpenRouter exposes an OpenAI-compatible `/chat/completions` endpoint, so this adapter talks to it
with plain `fetch` rather than pulling in the `openai` SDK — one dependency avoided for what's
otherwise a handful of `fetch` calls.

The interesting part is streaming. OpenAI-style SSE (server-sent events) sends `content` in small
fragments and — critically — sends **tool-call arguments in pieces too**, keyed by array index,
which have to be concatenated across chunks before the arguments are valid JSON:

```ts
// src/providers/openrouter.ts
const toolCallsByIndex = new Map<number, { id: string; name: string; args: string }>();
...
for (const tc of delta.tool_calls ?? []) {
  const existing = toolCallsByIndex.get(tc.index) ?? { id: "", name: "", args: "" };
  if (tc.id) existing.id = tc.id;
  if (tc.function?.name) existing.name = tc.function.name;
  if (tc.function?.arguments) existing.args += tc.function.arguments;
  toolCallsByIndex.set(tc.index, existing);
}
```

The raw HTTP stream itself arrives as arbitrary byte chunks, not clean lines, so there's a small
buffering dance to handle a line split across two chunks:

```ts
let buffer = "";
for await (const chunk of Readable.fromWeb(res.body as never)) {
  buffer += (chunk as Buffer).toString("utf-8");
  const lines = buffer.split("\n");
  buffer = lines.pop() ?? ""; // keep the last, possibly-incomplete line
  for (const line of lines) {
    if (!line.startsWith("data: ")) continue;
    ...
  }
}
```

`lines.pop()` removes and returns the last element, which is either an empty string (if the chunk
happened to end exactly on a newline) or a partial line — either way it gets prepended to the next
chunk's data instead of being processed prematurely. See
[pre-req/04-streaming-http-and-sse-parsing.md](../pre-req/04-streaming-http-and-sse-parsing.md)
for why this pattern is necessary at the TCP/HTTP level, not just an OpenRouter quirk.

`safeJsonParse` wraps every `JSON.parse` here in a try/catch that falls back to `{}` — a malformed
or partial SSE payload degrades to "no tool call info this chunk" rather than crashing the stream.
