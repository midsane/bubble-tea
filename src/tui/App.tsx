import React, { useRef, useState } from "react";
import { Box, useApp } from "ink";
import type { Provider, ChatMessage } from "../providers/types.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { CommandRegistry } from "../commands/registry.js";
import { parseCommand } from "../commands/registry.js";
import { runTurn } from "../loop/index.js";
import { appendMessages } from "../state/store.js";
import { expandFileMentions } from "../commands/mentions.js";
import { messagesToDisplay, notice, type DisplayItem } from "./display.js";
import { MessageStream } from "./MessageStream.js";
import { InputBox } from "./InputBox.js";
import { StatusBar } from "./StatusBar.js";

export interface AppProps {
  provider: Provider;
  registry: ToolRegistry;
  commands: CommandRegistry;
  projectKey: string;
  initialSessionId: string;
  initialMessages: ChatMessage[];
}

export function App({ provider, registry, commands, projectKey, initialSessionId, initialMessages }: AppProps) {
  const { exit } = useApp();
  const messagesRef = useRef<ChatMessage[]>(initialMessages);
  const persistedCountRef = useRef(initialMessages.length);
  // sessionId lives in a ref so persistence logic always reads the current
  // value synchronously, rather than depending on a re-render having
  // committed a fresh `handleSubmit` closure before the next write lands.
  const sessionIdRef = useRef(initialSessionId);
  const [sessionId, setSessionId] = useState(initialSessionId);
  const [history, setHistory] = useState<DisplayItem[]>(messagesToDisplay(initialMessages));
  const [busy, setBusy] = useState(false);

  function switchSession(newId: string) {
    sessionIdRef.current = newId;
    setSessionId(newId);
  }

  async function handleSubmit(raw: string) {
    const trimmed = raw.trim();
    if (trimmed.length === 0) return;
    if (trimmed === "exit" || trimmed === "quit") {
      exit();
      return;
    }

    const parsed = parseCommand(trimmed);
    if (parsed) {
      const command = commands.get(parsed.name);
      if (!command) {
        setHistory((h) => [...h, notice(`Unknown command "/${parsed.name}". Try /help.`)]);
        return;
      }
      setBusy(true);
      try {
        const result = await command.run({ projectKey, sessionId: sessionIdRef.current, args: parsed.args });
        if (result.newSessionId && result.newMessages) {
          switchSession(result.newSessionId);
          messagesRef.current = result.newMessages;
          persistedCountRef.current = result.newMessages.length;
          setHistory([...messagesToDisplay(result.newMessages), notice(result.output)]);
        } else {
          setHistory((h) => [...h, notice(result.output)]);
        }
      } catch (err) {
        setHistory((h) => [...h, notice(`[error] ${err instanceof Error ? err.message : String(err)}`)]);
      } finally {
        setBusy(false);
      }
      return;
    }

    setBusy(true);
    const startIndex = messagesRef.current.length;
    const expanded = await expandFileMentions(trimmed);
    messagesRef.current.push({ role: "user", content: expanded });
    setHistory((h) => [...h, { key: `u-${startIndex}`, role: "user", text: trimmed }]);

    try {
      await runTurn(provider, registry, messagesRef.current);
    } catch (err) {
      setHistory((h) => [...h, notice(`[error] ${err instanceof Error ? err.message : String(err)}`)]);
    }

    // Render everything the turn produced after the user message we already showed.
    const produced = messagesRef.current.slice(startIndex + 1);
    setHistory((h) => [...h, ...messagesToDisplay(produced)]);

    await appendMessages(projectKey, sessionIdRef.current, messagesRef.current.slice(persistedCountRef.current));
    persistedCountRef.current = messagesRef.current.length;
    setBusy(false);
  }

  return (
    <Box flexDirection="column">
      <MessageStream items={history} />
      <StatusBar providerName={provider.name} sessionId={sessionId} busy={busy} />
      <InputBox busy={busy} onSubmit={handleSubmit} />
    </Box>
  );
}
