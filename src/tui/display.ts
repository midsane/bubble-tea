import type { ChatMessage } from "../providers/types.js";

export interface DisplayItem {
  key: string;
  role: "user" | "assistant" | "tool" | "notice";
  text: string;
  /** Only meaningful when role === "notice": distinguishes a real failure from an FYI. */
  tone?: "info" | "error";
}

let counter = 0;
function nextKey(): string {
  counter += 1;
  return `d${counter}`;
}

export function notice(text: string, tone: "info" | "error" = "info"): DisplayItem {
  return { key: nextKey(), role: "notice", text, tone };
}

/** Maps a slice of conversation history to renderable lines. System messages are not shown. */
export function messagesToDisplay(messages: ChatMessage[]): DisplayItem[] {
  const items: DisplayItem[] = [];
  for (const m of messages) {
    if (m.role === "system") continue;
    if (m.role === "user") {
      items.push({ key: nextKey(), role: "user", text: m.content ?? "" });
      continue;
    }
    if (m.role === "assistant") {
      for (const tc of m.toolCalls ?? []) {
        items.push({ key: nextKey(), role: "tool", text: `→ ${tc.name}(${JSON.stringify(tc.arguments)})` });
      }
      if (m.content) items.push({ key: nextKey(), role: "assistant", text: m.content });
      continue;
    }
    if (m.role === "tool") {
      items.push({ key: nextKey(), role: "tool", text: `← ${m.content ?? ""}` });
    }
  }
  return items;
}
