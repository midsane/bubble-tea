import React from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";

export function StatusBar({
  providerName,
  sessionId,
  busy,
}: {
  providerName: string;
  sessionId: string;
  busy: boolean;
}) {
  return (
    <Box>
      <Text dimColor>
        [{providerName}] session {sessionId.slice(0, 24)} {busy ? <Spinner type="dots" /> : ""}
      </Text>
    </Box>
  );
}
