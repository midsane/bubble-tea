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
