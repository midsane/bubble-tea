import React from "react";
import { Box, Text } from "ink";
import type { DisplayItem } from "./display.js";

const COLORS: Record<DisplayItem["role"], string | undefined> = {
  user: "cyan",
  assistant: "green",
  tool: "gray",
  notice: "yellow",
};

const LABELS: Record<DisplayItem["role"], string> = {
  user: "you>",
  assistant: "agent>",
  tool: "",
  notice: "",
};

export function MessageStream({ items }: { items: DisplayItem[] }) {
  return (
    <Box flexDirection="column">
      {items.map((item) => {
        const label = LABELS[item.role];
        const color = item.role === "notice" && item.tone === "error" ? "red" : COLORS[item.role];
        return (
          <Box key={item.key}>
            <Text color={color}>
              {label ? `${label} ` : ""}
              {item.text}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
