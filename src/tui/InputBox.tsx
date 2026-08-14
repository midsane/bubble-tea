import React, { useState } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import type { Command } from "../commands/types.js";
import { currentAtToken, matchByPrefix, matchCommands } from "../commands/suggest.js";
import type { SkillDefinition } from "../config/skills.js";
import type { AgentDefinition } from "../agents/types.js";

// High enough to show the full command menu on a bare "/" (7 commands
// today) without capping the "highest-value moment" of the feature —
// still bounded so a much larger future command/mention set doesn't spam
// the terminal.
const MAX_HINTS = 10;

interface MentionCandidate {
  name: string;
  description: string;
  kind: "skill" | "agent";
}

export function InputBox({
  busy,
  onSubmit,
  commands,
  skills,
  agents,
}: {
  busy: boolean;
  onSubmit: (value: string) => void;
  commands: Command[];
  skills: SkillDefinition[];
  agents: AgentDefinition[];
}) {
  const [value, setValue] = useState("");

  const showSlashHints = value.startsWith("/") && !value.includes(" ");
  const slashHints = showSlashHints ? matchCommands(commands, value.slice(1)).slice(0, MAX_HINTS) : [];

  const atToken = currentAtToken(value);
  const mentionCandidates: MentionCandidate[] = [
    ...skills.map((s) => ({ name: s.name, description: s.description, kind: "skill" as const })),
    ...agents.map((a) => ({ name: a.name, description: a.description, kind: "agent" as const })),
  ];
  const atHints = atToken !== undefined ? matchByPrefix(mentionCandidates, atToken).slice(0, MAX_HINTS) : [];

  return (
    <Box flexDirection="column">
      <Box>
        <Text color={busy ? "gray" : "cyan"}>{"you> "}</Text>
        <TextInput
          value={value}
          onChange={setValue}
          onSubmit={(v) => {
            if (busy) return;
            setValue("");
            onSubmit(v);
          }}
        />
      </Box>
      {slashHints.length > 0 && (
        <Box flexDirection="column">
          {slashHints.map((c) => (
            <Text key={c.name} dimColor>
              {`  /${c.name} — ${c.description}`}
            </Text>
          ))}
        </Box>
      )}
      {atHints.length > 0 && (
        <Box flexDirection="column">
          {atHints.map((c) => (
            <Text key={`${c.kind}-${c.name}`} dimColor>
              {`  @${c.name} (${c.kind}) — ${c.description}`}
            </Text>
          ))}
        </Box>
      )}
    </Box>
  );
}
