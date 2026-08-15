import { buildSystemPrompt } from "../../systemPrompt.js";
import { newSessionId } from "../../state/store.js";
import type { Command, CommandContext, CommandResult } from "../types.js";

export const newCommand: Command = {
  name: "new",
  description: "Start a new session, clearing in-memory history.",
  async run(ctx: CommandContext): Promise<CommandResult> {
    const sessionId = newSessionId();
    const messages = [{ role: "system" as const, content: buildSystemPrompt() }];
    // Don't touch disk yet: a session file only earns its place once the
    // user actually sends something. Nothing here is persisted until the
    // first real turn/command writes it (see App.tsx's persistedCountRef).
    return {
      output: `Started new session ${sessionId}`,
      newSessionId: sessionId,
      newMessages: messages,
      persistedCount: 0,
      clearTerminal: true,
    };
  },
};
