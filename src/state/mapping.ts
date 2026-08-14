import { randomUUID } from "node:crypto";
import type { ChatMessage } from "../providers/types.js";
import type { MessageRecord, SummaryRecord, TranscriptRecord } from "./types.js";

export function fromChatMessage(sessionId: string, msg: ChatMessage): MessageRecord {
  return {
    type: "message",
    id: randomUUID(),
    sessionId,
    parentSessionId: "",
    timestamp: new Date().toISOString(),
    role: msg.role,
    content: msg.content,
    toolCalls: msg.toolCalls,
    toolCallId: msg.toolCallId,
    toolName: msg.toolName,
  };
}

export function toChatMessage(record: TranscriptRecord): ChatMessage {
  if (record.type === "summary") {
    return summaryToChatMessage(record);
  }
  return {
    role: record.role,
    content: record.content,
    toolCalls: record.toolCalls,
    toolCallId: record.toolCallId,
    toolName: record.toolName,
  };
}

function summaryToChatMessage(record: SummaryRecord): ChatMessage {
  return {
    role: "system",
    content: `[compacted summary of ${record.supersedes.length} earlier messages]\n${record.content}`,
  };
}

/**
 * Resolves a session's raw record log into the ChatMessage[] the loop should
 * actually see: records superseded by a SummaryRecord are dropped, and each
 * summary is placed where its earliest superseded record used to sit (not at
 * its own append position) — a summary is always written after the turns it
 * covers, so log order alone would push it past newer, still-active turns.
 */
export function resolveSession(records: TranscriptRecord[]): ChatMessage[] {
  const indexById = new Map<string, number>();
  records.forEach((r, i) => indexById.set(r.id, i));

  const superseded = new Set<string>();
  for (const r of records) {
    if (r.type === "summary") {
      for (const id of r.supersedes) superseded.add(id);
    }
  }

  const entries: { key: number; message: ChatMessage }[] = [];
  records.forEach((r, i) => {
    if (r.type === "summary") {
      const anchors = r.supersedes.map((id) => indexById.get(id)).filter((n): n is number => n !== undefined);
      const anchor = anchors.length > 0 ? Math.min(...anchors) : i;
      entries.push({ key: anchor - 0.5, message: toChatMessage(r) });
      return;
    }
    if (superseded.has(r.id)) return;
    entries.push({ key: i, message: toChatMessage(r) });
  });

  entries.sort((a, b) => a.key - b.key);
  return entries.map((e) => e.message);
}
