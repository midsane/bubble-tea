import React from "react";
import { Box, Text } from "ink";
import type { DisplayItem } from "./display.js";
import { theme } from "./theme.js";

const COLORS: Record<DisplayItem["role"], string | undefined> = {
  user: theme.gold,
  assistant: theme.caramel,
  tool: theme.cream,
  notice: theme.cream,
};

const LABELS: Record<DisplayItem["role"], string> = {
  user: "you>",
  assistant: "agent>",
  tool: "",
  notice: "",
};

export function MessageStream({ items, streamingText }: { items: DisplayItem[]; streamingText?: string }) {
  return (
    <Box flexDirection="column">
      {items.map((item) => {
        const label = LABELS[item.role];
        const color = item.role === "notice" && item.tone === "error" ? theme.error : COLORS[item.role];
        return (
          <Box key={item.key} marginBottom={item.role === "user" || item.role === "assistant" ? 1 : 0}>
            <Text color={color}>
              {label ? `${label} ` : ""}
              {item.text}
            </Text>
          </Box>
        );
      })}
      {streamingText ? (
        <Box>
          <Text color={COLORS.assistant}>
            {`${LABELS.assistant} `}
            {streamingText}
          </Text>
        </Box>
      ) : null}
    </Box>
  );
}
