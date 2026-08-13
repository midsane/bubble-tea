import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { createProviderFromEnv, type ChatMessage } from "./providers/index.js";
import { ToolRegistry } from "./tools/registry.js";
import { builtinTools } from "./tools/builtin/index.js";
import { runTurn } from "./loop/index.js";

async function main() {
  const provider = createProviderFromEnv();

  const registry = new ToolRegistry();
  for (const tool of builtinTools) registry.register(tool);

  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "You are bubble-tea, a coding agent running in a terminal. " +
        `The current working directory is ${process.cwd()}. ` +
        "You have tools to read/write files, list directories, and run shell commands. " +
        "Use them when a task requires touching the filesystem or running a command.",
    },
  ];

  console.log(`bubble-tea (phase 1) — provider: ${provider.name}. Type "exit" to quit.\n`);

  const rl = createInterface({ input: stdin, output: stdout });

  while (true) {
    const line = await rl.question("you> ");
    const trimmed = line.trim();
    if (trimmed === "exit" || trimmed === "quit") break;
    if (trimmed.length === 0) continue;

    messages.push({ role: "user", content: trimmed });

    try {
      const reply = await runTurn(provider, registry, messages);
      console.log(`\nagent> ${reply}\n`);
    } catch (err) {
      console.error(`\n[error] ${err instanceof Error ? err.message : String(err)}\n`);
    }
  }

  rl.close();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
