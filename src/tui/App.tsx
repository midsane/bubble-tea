import React, { useEffect, useRef, useState } from "react";
import { Box, useApp } from "ink";
import type { Provider, ChatMessage } from "../providers/types.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { CommandRegistry } from "../commands/registry.js";
import { parseCommand } from "../commands/registry.js";
import { runTurn } from "../loop/index.js";
import { AUTO_COMPACT_TOKEN_THRESHOLD, estimateTokens } from "../loop/compact.js";
import { appendMessages } from "../state/store.js";
import { compactSession } from "../state/compact.js";
import { expandMentions } from "../commands/mentions.js";
import type { SkillDefinition } from "../config/skills.js";
import type { HooksConfig } from "../hooks/types.js";
import type { BackgroundTask, TaskManager } from "../agents/taskManager.js";
import { messagesToDisplay, notice, type DisplayItem } from "./display.js";
import { Mascot } from "./Mascot.js";
import { MessageStream } from "./MessageStream.js";
import { InputBox } from "./InputBox.js";
import { StatusBar } from "./StatusBar.js";

export interface AppProps {
  provider: Provider;
  registry: ToolRegistry;
  commands: CommandRegistry;
  skills: SkillDefinition[];
  hooks: HooksConfig;
  taskManager: TaskManager;
  projectKey: string;
  initialSessionId: string;
  initialMessages: ChatMessage[];
}

export function App({
  provider,
  registry,
  commands,
  skills,
  hooks,
  taskManager,
  projectKey,
  initialSessionId,
  initialMessages,
}: AppProps) {
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
  const [runningTasks, setRunningTasks] = useState(0);

  // A background task (e.g. /plan) finishes on its own schedule, outside
  // any handleSubmit call — subscribe once so its result surfaces in the
  // stream whenever it lands, without blocking the main input loop.
  useEffect(() => {
    function onUpdate(task: BackgroundTask) {
      setRunningTasks(taskManager.list().filter((t) => t.status === "running").length);
      if (task.status === "running") return;
      const text =
        task.status === "completed"
          ? `[background: ${task.label}]\n${task.result}`
          : `[background: ${task.label}] failed: ${task.error}`;
      setHistory((h) => [...h, notice(text, task.status === "failed" ? "error" : "info")]);
    }
    taskManager.on("update", onUpdate);
    return () => {
      taskManager.off("update", onUpdate);
    };
  }, [taskManager]);

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
        setHistory((h) => [...h, notice(`Unknown command "/${parsed.name}". Try /help.`, "error")]);
        return;
      }
      setBusy(true);
      try {
        const result = await command.run({ projectKey, sessionId: sessionIdRef.current, args: parsed.args });
        if (result.newMessages) {
          if (result.newSessionId) switchSession(result.newSessionId);
          messagesRef.current = result.newMessages;
          persistedCountRef.current = result.newMessages.length;
          setHistory([...messagesToDisplay(result.newMessages), notice(result.output)]);
        } else {
          setHistory((h) => [...h, notice(result.output)]);
        }
      } catch (err) {
        setHistory((h) => [...h, notice(`[error] ${err instanceof Error ? err.message : String(err)}`, "error")]);
      } finally {
        setBusy(false);
      }
      return;
    }

    setBusy(true);
    const startIndex = messagesRef.current.length;
    const expanded = await expandMentions(trimmed, skills);
    messagesRef.current.push({ role: "user", content: expanded });
    setHistory((h) => [...h, { key: `u-${startIndex}`, role: "user", text: trimmed }]);

    try {
      await runTurn(provider, registry, messagesRef.current, hooks);
    } catch (err) {
      setHistory((h) => [...h, notice(`[error] ${err instanceof Error ? err.message : String(err)}`)]);
    }

    // Render everything the turn produced after the user message we already showed.
    const produced = messagesRef.current.slice(startIndex + 1);
    setHistory((h) => [...h, ...messagesToDisplay(produced)]);

    await appendMessages(projectKey, sessionIdRef.current, messagesRef.current.slice(persistedCountRef.current));
    persistedCountRef.current = messagesRef.current.length;

    if (estimateTokens(messagesRef.current) > AUTO_COMPACT_TOKEN_THRESHOLD) {
      const outcome = await compactSession(provider, projectKey, sessionIdRef.current);
      if (outcome) {
        messagesRef.current = outcome.messages;
        persistedCountRef.current = outcome.messages.length;
        setHistory((h) => [...h, notice(`[auto-compacted ${outcome.summarizedCount} earlier message(s) into a summary]`)]);
      }
    }

    setBusy(false);
  }

  return (
    <Box flexDirection="column">
      <Mascot />
      <MessageStream items={history} />
      <StatusBar providerName={provider.name} sessionId={sessionId} busy={busy} runningTasks={runningTasks} />
      <InputBox busy={busy} onSubmit={handleSubmit} commands={commands.list()} />
    </Box>
  );
}
