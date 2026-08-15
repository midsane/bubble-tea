import React from "react";
import { Box, Static, Text } from "ink";
import { theme } from "./theme.js";

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
        <Box key="mascot" flexDirection="column" marginBottom={1} borderStyle="round" borderColor={theme.brown} paddingX={3}>
          <Text color={theme.caramel}>{"  ʕ•ᴥ•ʔ  🧋"}</Text>
          <Text color={theme.gold} bold>
            {"  bubble-tea"}
          </Text>
        </Box>
      )}
    </Static>
  );
}
