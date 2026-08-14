import React from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";

export function StatusBar({
  providerName,
  sessionId,
  busy,
  runningTasks = 0,
}: {
  providerName: string;
  sessionId: string;
  busy: boolean;
  runningTasks?: number;
}) {
  return (
    <Box>
      <Text dimColor>
        [{providerName}] session {sessionId.slice(0, 24)} {busy ? <Spinner type="dots" /> : ""}
        {runningTasks > 0 ? ` (${runningTasks} background task${runningTasks === 1 ? "" : "s"} running)` : ""}
      </Text>
    </Box>
  );
}
