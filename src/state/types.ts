import type { ChatMessage, Role, ToolCall } from "../providers/types.js";

/**
 * A persisted transcript entry. Distinct from ChatMessage (the provider-facing
 * type): it carries persistence concerns — id, session linkage, timestamp —
 * and a `type` discriminator so a later "summary" record can supersede a
 * range of "message" records (Phase 5 /compact) without a schema migration.
 */
export type TranscriptRecord = MessageRecord | SummaryRecord;

export interface MessageRecord {
  type: "message";
  id: string;
  sessionId: string;
  /** empty for a top-level session; set for a sub-agent sidechain (Phase 4) */
  parentSessionId: string;
  timestamp: string;
  role: Role;
  content: string | null;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  toolName?: string;
}

export interface SummaryRecord {
  type: "summary";
  id: string;
  sessionId: string;
  parentSessionId: string;
  timestamp: string;
  /** ids of the MessageRecords this summary replaces */
  supersedes: string[];
  content: string;
}

export interface SessionInfo {
  id: string;
  startedAt: string;
  firstUserMessage: string | null;
}

export type { ChatMessage };
