import { toChatMessage } from "../../state/mapping.js";
import { listSessions, readSession } from "../../state/store.js";
import type { Command, CommandContext, CommandResult } from "../types.js";

export const sessionCommand: Command = {
  name: "session",
  description: "List sessions (/session) or switch to one (/session <n|id>).",
  async run(ctx: CommandContext): Promise<CommandResult> {
    const sessions = await listSessions(ctx.projectKey);

    if (ctx.args.length === 0) {
      if (sessions.length === 0) return { output: "No sessions yet." };
      const lines = sessions.map((s, i) => {
        const marker = s.id === ctx.sessionId ? "*" : " ";
        const preview = s.firstUserMessage ? s.firstUserMessage.slice(0, 60) : "(no user message yet)";
        return `${marker} ${i + 1}. ${s.id}  ${s.startedAt}  ${preview}`;
      });
      return { output: lines.join("\n") };
    }

    const arg = ctx.args[0];
    const index = Number.parseInt(arg, 10);
    const target =
      Number.isInteger(index) && index >= 1 && index <= sessions.length
        ? sessions[index - 1]
        : sessions.find((s) => s.id === arg);

    if (!target) {
      return { output: `No session matching "${arg}". Run /session with no args to list.` };
    }

    const messages = (await readSession(ctx.projectKey, target.id)).map(toChatMessage);
    return {
      output: `Switched to session ${target.id}`,
      newSessionId: target.id,
      newMessages: messages,
    };
  },
};
