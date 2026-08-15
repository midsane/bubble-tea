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

// Split out from MessageStream and memoized so it only re-renders when
// `items` itself changes. Without this, every streaming token re-mapped
// the whole (potentially long) history on each render, which is most of
// where the "streaming lags badly" slowdown came from.
const HistoryList = React.memo(function HistoryList({ items }: { items: DisplayItem[] }) {
  return (
    <>
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
    </>
  );
});

export function MessageStream({ items, streamingText }: { items: DisplayItem[]; streamingText?: string }) {
  return (
    <Box flexDirection="column">
      <HistoryList items={items} />
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
