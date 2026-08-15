import React, { useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import type { Command } from "../commands/types.js";
import { currentAtToken, matchByPrefix, matchCommands } from "../commands/suggest.js";
import { listPathCandidates, splitPathToken } from "../commands/pathSuggest.js";
import type { SkillDefinition } from "../config/skills.js";
import type { AgentDefinition } from "../agents/types.js";
import { theme } from "./theme.js";

// High enough to show the full command menu on a bare "/" (8 commands
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

  const mode: "slash" | "mention" | "none" = showSlashHints ? "slash" : atToken !== undefined ? "mention" : "none";
  const hintCount = mode === "slash" ? slashHints.length : mode === "mention" ? atHints.length + fileHintsCapped.length : 0;

  // Selection resets whenever the typed text changes, not on navigation
  // itself — arrow/tab presses move selectedIndex without touching value.
  const [selectedIndex, setSelectedIndex] = useState(0);
  useEffect(() => {
    setSelectedIndex(0);
  }, [value]);

  // ink-text-input only re-syncs its internal cursorOffset when the new
  // value is *shorter* than the previous cursor position, so a completion
  // that lengthens the value leaves the fake cursor stranded mid-string.
  // Remounting via a bumped key forces it to re-initialize cursorOffset to
  // the full (completed) value's length.
  const [inputKey, setInputKey] = useState(0);

  useInput((_input, key) => {
    if (busy || hintCount === 0) return;

    if (key.downArrow) {
      setSelectedIndex((i) => (i + 1) % hintCount);
      return;
    }
    if (key.upArrow) {
      setSelectedIndex((i) => (i - 1 + hintCount) % hintCount);
      return;
    }
    if (key.tab) {
      const index = Math.min(selectedIndex, hintCount - 1);
      if (mode === "slash") {
        setValue(`/${slashHints[index].name} `);
      } else if (atToken !== undefined) {
        const prefix = value.slice(0, value.length - atToken.length);
        if (index < atHints.length) {
          setValue(`${prefix}${atHints[index].name} `);
        } else {
          const path = fileHintsCapped[index - atHints.length];
          setValue(`${prefix}${path}${path.endsWith("/") ? "" : " "}`);
        }
      }
      setInputKey((k) => k + 1);
    }
  });

  return (
    <Box flexDirection="column">
      <Box borderStyle="round" borderColor={busy ? theme.brown : theme.gold} paddingX={2}>
        <Text color={busy ? theme.brown : theme.gold}>{"you> "}</Text>
        <TextInput
          key={inputKey}
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
          {slashHints.map((c, i) => (
            <Text key={c.name} color={i === selectedIndex ? theme.gold : theme.cream} dimColor={i !== selectedIndex}>
              {`${i === selectedIndex ? "> " : "  "}/${c.name} — ${c.description}`}
            </Text>
          ))}
        </Box>
      )}
      {(atHints.length > 0 || fileHintsCapped.length > 0) && (
        <Box flexDirection="column">
          {atHints.map((c, i) => (
            <Text key={`${c.kind}-${c.name}`} color={i === selectedIndex ? theme.gold : theme.cream} dimColor={i !== selectedIndex}>
              {`${i === selectedIndex ? "> " : "  "}@${c.name} (${c.kind}) — ${c.description}`}
            </Text>
          ))}
          {fileHintsCapped.map((path, i) => {
            const idx = atHints.length + i;
            return (
              <Text key={`file-${path}`} color={idx === selectedIndex ? theme.gold : theme.cream} dimColor={idx !== selectedIndex}>
                {`${idx === selectedIndex ? "> " : "  "}@${path}`}
              </Text>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
