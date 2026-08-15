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
import type { AgentDefinition } from "../agents/types.js";
import { runAgent } from "../agents/run.js";
import { findAgentMention } from "../agents/mentionMatch.js";
import { messagesToDisplay, notice, userEcho, type DisplayItem } from "./display.js";
import { createThrottled } from "./throttle.js";
import { Mascot } from "./Mascot.js";
import { MessageStream } from "./MessageStream.js";
import { InputBox } from "./InputBox.js";
import { StatusBar } from "./StatusBar.js";

export interface AppProps {
  provider: Provider;
  registry: ToolRegistry;
  commands: CommandRegistry;
  skills: SkillDefinition[];
  agents: AgentDefinition[];
  hooks: HooksConfig;
  taskManager: TaskManager;
  projectKey: string;
  initialSessionId: string;
  initialMessages: ChatMessage[];
  clearTerminal: () => void;
}

export function App({
  provider,
  registry,
  commands,
  skills,
  agents,
  hooks,
  taskManager,
  projectKey,
  initialSessionId,
  initialMessages,
  clearTerminal,
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
  const [streamingText, setStreamingText] = useState("");
  // Provider deltas can arrive many times a second; re-rendering the whole
  // Ink tree on every single one is what made streaming feel laggy.
  // Coalesce updates to a fixed rate instead of setting state on every
  // token — still reads as live, but bounds render frequency.
  const streamThrottleRef = useRef(createThrottled<string>(setStreamingText, 50));

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
      // See the /exit handling below: exit() only unmounts Ink, it doesn't
      // end the process, and stdio-piped MCP server child processes would
      // otherwise keep the event loop (and the process) alive.
      process.exit(0);
      return;
    }

    // @agent-name (or @agent-name-agent, matching the spec's "@plan-agent"
    // form) invokes a sub-agent directly, the mention-driven counterpart to
    // /plan — dispatched the same way, as a background task, before falling
    // through to slash-command parsing or the normal turn flow.
    if (trimmed.includes("@")) {
      const match = findAgentMention(trimmed, agents);
      if (match) {
        const taskId = taskManager.start(`${match.agent.name}: ${match.task}`, async () => {
          const { sessionId, result } = await runAgent(
            match.agent,
            provider,
            registry,
            hooks,
            projectKey,
            sessionIdRef.current,
            match.task
          );
          return `[session ${sessionId}]\n${result}`;
        });
        setHistory((h) => [
          ...h,
          notice(`Started ${match.agent.name} agent in the background (task ${taskId}). Check /tasks or wait for it to surface here.`),
        ]);
        return;
      }
    }

    const parsed = parseCommand(trimmed);
    if (parsed) {
      const command = commands.get(parsed.name);
      if (!command) {
        setHistory((h) => [...h, notice(`Unknown command "/${parsed.name}". Try /help.`, "error")]);
        return;
      }
      // Echo the raw command text immediately, the same way a normal chat
      // message is shown before its turn runs — otherwise the input the
      // user just typed (e.g. "/eval") never appears anywhere, including
      // commands that rebuild `history` wholesale below.
      const echo = userEcho(trimmed);
      setHistory((h) => [...h, echo]);
      setBusy(true);
      try {
        const result = await command.run({ projectKey, sessionId: sessionIdRef.current, args: parsed.args });
        if (result.clearTerminal) clearTerminal();
        if (result.newMessages) {
          if (result.newSessionId) switchSession(result.newSessionId);
          messagesRef.current = result.newMessages;
          persistedCountRef.current = result.newMessages.length;
          setHistory([...messagesToDisplay(result.newMessages), echo, notice(result.output)]);
        } else {
          setHistory((h) => [...h, notice(result.output)]);
        }
        if (result.exit) {
          exit();
          // exit() only unmounts the Ink UI; it doesn't terminate the
          // process. Ctrl+C kills the whole process (and, as a side
          // effect, the stdio-piped MCP server child processes with it).
          // Match that here, instead of leaving the event loop alive on
          // those still-open child-process handles.
          process.exit(0);
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
      await runTurn(provider, registry, messagesRef.current, hooks, undefined, streamThrottleRef.current.update);
    } catch (err) {
      setHistory((h) => [...h, notice(`[error] ${err instanceof Error ? err.message : String(err)}`, "error")]);
    }
    // Cancel first: a pending trailing flush from the throttle would
    // otherwise land after this clear and briefly resurrect stale text.
    streamThrottleRef.current.cancel();
    setStreamingText("");

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
      <MessageStream items={history} streamingText={busy ? streamingText : ""} />
      <StatusBar providerName={provider.name} sessionId={sessionId} busy={busy} runningTasks={runningTasks} />
      <InputBox busy={busy} onSubmit={handleSubmit} commands={commands.list()} skills={skills} agents={agents} />
    </Box>
  );
}
