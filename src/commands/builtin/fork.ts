import { resolveSession } from "../../state/mapping.js";
import { forkSession, readSession } from "../../state/store.js";
import type { Command, CommandContext, CommandResult } from "../types.js";

export const forkCommand: Command = {
  name: "fork",
  description: "Fork the current session into a new one with the same history.",
  async run(ctx: CommandContext): Promise<CommandResult> {
    const forkedSessionId = await forkSession(ctx.projectKey, ctx.sessionId);
    const messages = resolveSession(await readSession(ctx.projectKey, forkedSessionId));
    return {
      output: `Forked session ${ctx.sessionId} -> ${forkedSessionId}`,
      newSessionId: forkedSessionId,
      newMessages: messages,
    };
  },
};
