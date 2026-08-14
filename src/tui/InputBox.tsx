import React, { useState } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import type { Command } from "../commands/types.js";
import { matchCommands } from "../commands/suggest.js";

// High enough to show the full command menu on a bare "/" (7 commands
// today) without capping the "highest-value moment" of the feature —
// still bounded so a much larger future command set doesn't spam the
// terminal.
const MAX_HINTS = 10;

export function InputBox({
  busy,
  onSubmit,
  commands,
}: {
  busy: boolean;
  onSubmit: (value: string) => void;
  commands: Command[];
}) {
  const [value, setValue] = useState("");

  const showHints = value.startsWith("/") && !value.includes(" ");
  const hints = showHints ? matchCommands(commands, value.slice(1)).slice(0, MAX_HINTS) : [];

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
      {hints.length > 0 && (
        <Box flexDirection="column">
          {hints.map((c) => (
            <Text key={c.name} dimColor>
              {`  /${c.name} — ${c.description}`}
            </Text>
          ))}
        </Box>
      )}
    </Box>
  );
}
