import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";

export type BackgroundTaskStatus = "running" | "completed" | "failed";

export interface BackgroundTask {
  id: string;
  label: string;
  status: BackgroundTaskStatus;
  result?: string;
  error?: string;
  startedAt: string;
  finishedAt?: string;
}

/**
 * Tracks fire-and-forget async work (sub-agent runs) without blocking the
 * caller. "Background" here means same-process concurrent promises, not a
 * worker/process pool — sufficient since the harness is single-user and
 * single-machine (see implementation-process.md's out-of-scope note).
 * Emits "update" with a snapshot of the task whenever its status changes,
 * so a UI can subscribe once and stay in sync without polling.
 */
export class TaskManager extends EventEmitter {
  private readonly tasks = new Map<string, BackgroundTask>();

  start(label: string, fn: () => Promise<string>): string {
    const id = randomUUID();
    const task: BackgroundTask = { id, label, status: "running", startedAt: new Date().toISOString() };
    this.tasks.set(id, task);
    this.emit("update", { ...task });

    fn().then(
      (result) => this.settle(id, { status: "completed", result }),
      (err) => this.settle(id, { status: "failed", error: err instanceof Error ? err.message : String(err) })
    );

    return id;
  }

  private settle(id: string, patch: Partial<BackgroundTask>): void {
    const current = this.tasks.get(id);
    if (!current) return;
    const updated: BackgroundTask = { ...current, ...patch, finishedAt: new Date().toISOString() };
    this.tasks.set(id, updated);
    this.emit("update", { ...updated });
  }

  list(): BackgroundTask[] {
    return [...this.tasks.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  get(id: string): BackgroundTask | undefined {
    return this.tasks.get(id);
  }
}
