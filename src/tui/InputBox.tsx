import React, { useState } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";

export function InputBox({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (value: string) => void;
}) {
  const [value, setValue] = useState("");

  return (
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
  );
}
