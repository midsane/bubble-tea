# 04 — Streaming HTTP, Server-Sent Events, and why line-buffering is necessary

## A normal HTTP response vs. a streamed one

Ordinarily, `fetch()` waits for the whole response body before you can read it. A streamed
response instead exposes the body as a `ReadableStream` — bytes become available incrementally, as
the server sends them, and your code can start processing before the response finishes. This is
what makes token-by-token rendering possible: the model provider sends output as it's generated,
and the client (bubble-tea) reads and renders each piece as it arrives instead of waiting for the
full answer.

## Server-Sent Events (SSE): a simple text framing on top of a stream

OpenRouter's streaming endpoint (like OpenAI's) uses SSE framing: each event is a line starting
with `data: `, followed by a JSON payload, terminated by `data: [DONE]`:

```
data: {"choices":[{"delta":{"content":"Hel"}}]}

data: {"choices":[{"delta":{"content":"lo"}}]}

data: [DONE]
```

SSE is a text protocol layered on a plain HTTP chunked response — there's no special HTTP verb or
content negotiation beyond a `Content-Type` header; the client just has to know to split the body
on newlines and interpret `data: ` prefixed lines.

## The problem: TCP doesn't respect your message boundaries

A crucial, easy-to-miss fact: **network chunks do not arrive aligned with logical lines.** A single
`data: {...}` JSON payload can be split across two separate chunks delivered to your code, and a
single chunk can contain multiple complete lines plus the start of a third. Naively splitting each
chunk on `\n` and processing every resulting piece would sometimes hand you half a JSON object.

## The fix: buffer, split, keep the remainder

```ts
// src/providers/openrouter.ts
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

Every new chunk is appended to a running `buffer`, then the buffer is split on newlines. All lines
*except the last* are guaranteed complete (a newline terminated them), so they're safe to process.
The last element of `split("\n")` might be a complete line with no trailing newline yet, or it
might be a genuinely partial line cut off mid-JSON — either way, `lines.pop()` removes it from the
batch being processed and keeps it in `buffer` to be completed by the next chunk. This pattern
(accumulate → split → process all-but-last → carry the remainder forward) is the standard way to
parse any line-oriented protocol off a byte stream, not something specific to SSE or OpenRouter.

`Readable.fromWeb(res.body)` bridges the standard web `ReadableStream` (what `fetch`'s `res.body`
is) into Node's own `Readable` stream interface, which is what lets `for await` iterate it directly
as chunks of `Buffer`.

## Contrast: Gemini's streaming doesn't need this

`GeminiProvider.stream()` iterates `await this.client.models.generateContentStream(...)` directly —
the `@google/genai` SDK already parses the underlying transport and hands back whole, structured
chunk objects (`chunk.candidates[0].content.parts`), never raw bytes. The line-buffering dance is
specific to hand-rolling the OpenAI-compatible SSE format over plain `fetch`, which is exactly what
`OpenRouterProvider` does (see `detailed-working/02-providers.md` for why: avoiding a whole SDK
dependency for what's otherwise a few `fetch` calls).
