import { appendFile, mkdir, readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import type { ChatMessage } from "../providers/types.js";
import { fromChatMessage } from "./mapping.js";
import type { SessionInfo, TranscriptRecord } from "./types.js";

export function projectKey(cwd: string = process.cwd()): string {
  return cwd.replace(/\//g, "-");
}

function sessionsDir(projectKey: string): string {
  return join(homedir(), ".bubbletea", "sessions", projectKey);
}

function sessionFile(projectKey: string, sessionId: string): string {
  return join(sessionsDir(projectKey), `${sessionId}.jsonl`);
}

export function newSessionId(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const suffix = randomBytes(3).toString("hex");
  return `${stamp}-${suffix}`;
}

export async function appendRecord(
  projectKey: string,
  sessionId: string,
  record: TranscriptRecord
): Promise<void> {
  const dir = sessionsDir(projectKey);
  await mkdir(dir, { recursive: true });
  await appendFile(sessionFile(projectKey, sessionId), `${JSON.stringify(record)}\n`, "utf-8");
}

export async function readSession(projectKey: string, sessionId: string): Promise<TranscriptRecord[]> {
  let raw: string;
  try {
    raw = await readFile(sessionFile(projectKey, sessionId), "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  return raw
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as TranscriptRecord);
}

export async function appendMessages(
  projectKey: string,
  sessionId: string,
  messages: ChatMessage[]
): Promise<void> {
  for (const msg of messages) {
    await appendRecord(projectKey, sessionId, fromChatMessage(sessionId, msg));
  }
}

export async function mostRecentSession(projectKey: string): Promise<SessionInfo | undefined> {
  const sessions = await listSessions(projectKey);
  return sessions[0];
}

export async function listSessions(projectKey: string): Promise<SessionInfo[]> {
  const dir = sessionsDir(projectKey);
  let files: string[];
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith(".jsonl"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }

  const infos: SessionInfo[] = [];
  for (const file of files) {
    const sessionId = file.slice(0, -".jsonl".length);
    const records = await readSession(projectKey, sessionId);
    if (records.length === 0) continue;
    const firstUser = records.find((r) => r.type === "message" && r.role === "user");
    infos.push({
      id: sessionId,
      startedAt: records[0].timestamp,
      firstUserMessage:
        firstUser && firstUser.type === "message" ? (firstUser.content ?? null) : null,
    });
  }

  return infos.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}
