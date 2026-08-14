import type { ChatMessage, Provider } from "../providers/types.js";
import type { MessageRecord, TranscriptRecord } from "../state/types.js";

export const AUTO_COMPACT_TOKEN_THRESHOLD = 6_000;
const DEFAULT_KEEP_RECENT_TURNS = 3;

/** Rough chars/4 estimate — good enough to trigger compaction, not for billing. */
export function estimateTokens(messages: ChatMessage[]): number {
  let chars = 0;
  for (const m of messages) {
    chars += m.content?.length ?? 0;
    if (m.toolCalls) chars += JSON.stringify(m.toolCalls).length;
  }
  return Math.ceil(chars / 4);
}

export interface CompactionPlan {
  /** Message records to fold into a summary, in original order. */
  toSummarize: MessageRecord[];
}

/**
 * Picks a compaction boundary that lands right before a user message. A
 * fresh user message can only appear once the prior turn's tool-call loop
 * has fully resolved, so cutting there can never separate an
 * assistant-with-toolCalls record from the tool-result records that answer
 * it (both wire formats reject that pairing being split).
 *
 * `records` should already be supersession-resolved (see resolveSession) so
 * repeated compaction only ever summarizes still-active records.
 */
export function buildCompactionPlan(
  records: TranscriptRecord[],
  keepRecentTurns: number = DEFAULT_KEEP_RECENT_TURNS
): CompactionPlan | null {
  const userIndices = records
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r.type === "message" && r.role === "user")
    .map(({ i }) => i);

  if (userIndices.length <= keepRecentTurns) return null;

  const boundary = userIndices[userIndices.length - keepRecentTurns];
  // Never touch index 0 (the system prompt record).
  const toSummarize = records
    .slice(1, boundary)
    .filter((r): r is MessageRecord => r.type === "message");

  if (toSummarize.length === 0) return null;
  return { toSummarize };
}

export async function summarizeRecords(provider: Provider, toSummarize: MessageRecord[]): Promise<string> {
  const transcript = toSummarize
    .map((r) => {
      if (r.role === "tool") return `[tool result: ${r.toolName}] ${r.content ?? ""}`;
      if (r.toolCalls && r.toolCalls.length > 0) {
        const calls = r.toolCalls.map((c) => `${c.name}(${JSON.stringify(c.arguments)})`).join(", ");
        return `[${r.role}] ${r.content ?? ""} (called: ${calls})`;
      }
      return `[${r.role}] ${r.content ?? ""}`;
    })
    .join("\n");

  const prompt: ChatMessage[] = [
    {
      role: "system",
      content:
        "Summarize the following conversation excerpt into a compact but faithful account: " +
        "what the user asked for, what was done (including notable tool calls and their outcomes), " +
        "and any open threads or decisions that later turns should still know about. Plain prose, no preamble.",
    },
    { role: "user", content: transcript },
  ];

  const result = await provider.chat(prompt, []);
  return result.content ?? "(summary unavailable)";
}
