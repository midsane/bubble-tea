import React from "react";
import { Box, Static, Text } from "ink";

const ASCII_ART = `
   |
  _|_
 /   \\
| ~~~ |
|o o o|
|o o o|
 \\___/`;

/**
 * One-shot splash, not a persistent header: mounted via Static so it
 * flushes once at startup and is never re-rendered, scrolling into normal
 * terminal scrollback like a banner rather than occupying a fixed row for
 * the rest of a long-running session.
 */
export function Mascot() {
  return (
    <Static items={["mascot"]}>
      {() => (
        <Box key="mascot" flexDirection="column" marginBottom={1}>
          <Text color="cyan">{ASCII_ART}</Text>
          <Text color="cyan" bold>
            {"  bubble-tea"}
          </Text>
        </Box>
      )}
    </Static>
  );
}
