import { buildSystemPrompt } from "../../systemPrompt.js";
import { appendMessages, newSessionId } from "../../state/store.js";
import type { Command, CommandContext, CommandResult } from "../types.js";

export const newCommand: Command = {
  name: "new",
  description: "Start a new session, clearing in-memory history.",
  async run(ctx: CommandContext): Promise<CommandResult> {
    const sessionId = newSessionId();
    const messages = [{ role: "system" as const, content: buildSystemPrompt() }];
    await appendMessages(ctx.projectKey, sessionId, messages);
    return {
      output: `Started new session ${sessionId}`,
      newSessionId: sessionId,
      newMessages: messages,
    };
  },
};
