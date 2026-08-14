import type { AgentDefinition } from "./types.js";

const MENTION_PATTERN = /@([^\s]+)/g;

export interface AgentMentionMatch {
  agent: AgentDefinition;
  /** Input with the matched mention token removed and trimmed — falls back to the full input if that would be empty. */
  task: string;
}

/**
 * Finds the first @mention in `input` that names a known agent — either its
 * bare name ("@plan") or the "-agent" suffixed form the spec calls out
 * explicitly ("@plan-agent") — so invocation works either way.
 */
export function findAgentMention(input: string, agents: AgentDefinition[]): AgentMentionMatch | undefined {
  for (const match of input.matchAll(MENTION_PATTERN)) {
    const token = match[1];
    const agent = agents.find((a) => token === a.name || token === `${a.name}-agent`);
    if (!agent) continue;

    const stripped = (input.slice(0, match.index) + input.slice(match.index + match[0].length))
      .replace(/\s+/g, " ")
      .trim();
    return { agent, task: stripped.length > 0 ? stripped : input.trim() };
  }
  return undefined;
}
