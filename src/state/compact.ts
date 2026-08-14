import { randomUUID } from "node:crypto";
import type { ChatMessage, Provider } from "../providers/types.js";
import { buildCompactionPlan, summarizeRecords } from "../loop/compact.js";
import { resolveSession } from "./mapping.js";
import { appendRecord, readSession } from "./store.js";
import type { SummaryRecord } from "./types.js";

export interface CompactionOutcome {
  messages: ChatMessage[];
  summarizedCount: number;
}

/**
 * Reads a session's active (already resolved) records, folds everything
 * older than the last `keepRecentTurns` user turns into a single summary
 * record, persists that summary, and returns the resulting message list.
 * Returns null if there isn't enough history to bother compacting.
 */
export async function compactSession(
  provider: Provider,
  projectKey: string,
  sessionId: string,
  keepRecentTurns?: number
): Promise<CompactionOutcome | null> {
  const records = await readSession(projectKey, sessionId);

  const superseded = new Set<string>();
  for (const r of records) {
    if (r.type === "summary") for (const id of r.supersedes) superseded.add(id);
  }
  const active = records.filter((r) => !superseded.has(r.id));

  const plan = buildCompactionPlan(active, keepRecentTurns);
  if (!plan) return null;

  const content = await summarizeRecords(provider, plan.toSummarize);
  const summary: SummaryRecord = {
    type: "summary",
    id: randomUUID(),
    sessionId,
    parentSessionId: "",
    timestamp: new Date().toISOString(),
    supersedes: plan.toSummarize.map((r) => r.id),
    content,
  };
  await appendRecord(projectKey, sessionId, summary);

  const updated = await readSession(projectKey, sessionId);
  return { messages: resolveSession(updated), summarizedCount: plan.toSummarize.length };
}
