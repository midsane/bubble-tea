import React, { useEffect, useState } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import type { Command } from "../commands/types.js";
import { currentAtToken, matchByPrefix, matchCommands } from "../commands/suggest.js";
import { listPathCandidates, splitPathToken } from "../commands/pathSuggest.js";
import type { SkillDefinition } from "../config/skills.js";
import type { AgentDefinition } from "../agents/types.js";
import { theme } from "./theme.js";

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
  const [fileHints, setFileHints] = useState<string[]>([]);

  const showSlashHints = value.startsWith("/") && !value.includes(" ");
  const slashHints = showSlashHints ? matchCommands(commands, value.slice(1)).slice(0, MAX_HINTS) : [];

  const atToken = currentAtToken(value);
  const mentionCandidates: MentionCandidate[] = [
    ...skills.map((s) => ({ name: s.name, description: s.description, kind: "skill" as const })),
    ...agents.map((a) => ({ name: a.name, description: a.description, kind: "agent" as const })),
  ];
  const atHints = atToken !== undefined ? matchByPrefix(mentionCandidates, atToken).slice(0, MAX_HINTS) : [];

  // Filesystem listing is async (a readdir), unlike the in-memory
  // skill/agent/command matches above, so it can't be computed inline
  // during render — an effect keyed on the token itself means a stale
  // read from an earlier keystroke can never clobber a newer one.
  useEffect(() => {
    let cancelled = false;

    if (atToken === undefined) {
      setFileHints([]);
      return;
    }
    const { dir, partial } = splitPathToken(atToken);
    // A bare "@" (root dir, nothing typed) stays skill/agent-only — dumping
    // the whole cwd there would bury the curated, high-value initial menu.
    if (dir === "." && partial === "") {
      setFileHints([]);
      return;
    }

    listPathCandidates(dir, partial).then((results) => {
      if (!cancelled) setFileHints(results);
    });

    return () => {
      cancelled = true;
    };
  }, [atToken]);

  // Skill/agent matches take priority in the shared @ hint budget; files
  // fill whatever's left rather than each list independently hitting the cap.
  const fileHintsCapped = atToken !== undefined ? fileHints.slice(0, Math.max(0, MAX_HINTS - atHints.length)) : [];

  return (
    <Box flexDirection="column">
      <Box borderStyle="round" borderColor={busy ? theme.brown : theme.gold} paddingX={1}>
        <Text color={busy ? theme.brown : theme.gold}>{"you> "}</Text>
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
            <Text key={c.name} color={theme.cream} dimColor>
              {`  /${c.name} — ${c.description}`}
            </Text>
          ))}
        </Box>
      )}
      {(atHints.length > 0 || fileHintsCapped.length > 0) && (
        <Box flexDirection="column">
          {atHints.map((c) => (
            <Text key={`${c.kind}-${c.name}`} color={theme.cream} dimColor>
              {`  @${c.name} (${c.kind}) — ${c.description}`}
            </Text>
          ))}
          {fileHintsCapped.map((path) => (
            <Text key={`file-${path}`} color={theme.cream} dimColor>
              {`  @${path}`}
            </Text>
          ))}
        </Box>
      )}
    </Box>
  );
}
