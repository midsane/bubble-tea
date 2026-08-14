# 08 — The `~/.bubbletea` config directory, skills, and agent definitions

## Why machine root, not project-local

Per `architecture.md`'s explicit constraint, config lives at `~/.bubbletea/` — one place per
machine, mirroring `~/.claude` — not a `.bubbletea/` folder inside each project. `src/config/paths.ts`
is the single source of truth for every path under it:

```ts
export function configRoot(): string { return join(homedir(), ".bubbletea"); }
export function skillsDir(): string { return join(configRoot(), "skills"); }
export function agentsDir(): string { return join(configRoot(), "agents"); }
export function hooksDir(): string { return join(configRoot(), "hooks"); }
export function hooksConfigPath(): string { return join(hooksDir(), "config.json"); }
export function mcpConfigPath(): string { return join(configRoot(), "mcp.json"); }
export function sessionsDir(projectKey: string): string { return join(configRoot(), "sessions", projectKey); }
```

Every other module (`config/ensure.ts`, `config/skills.ts`, `agents/loader.ts`, `hooks/config.ts`,
`mcp/client.ts`, `state/store.ts`) imports from here rather than joining `homedir()` itself — one
place to change the convention if it ever needs to.

## First-run seeding: who creates what, when

`ensureConfigDirs()` (`src/config/ensure.ts`), called once at the top of `src/cli.ts`, is the only
thing that runs unconditionally on every startup:

```ts
export async function ensureConfigDirs(): Promise<void> {
  await Promise.all([
    mkdir(skillsDir(), { recursive: true }),
    mkdir(agentsDir(), { recursive: true }),
    mkdir(hooksDir(), { recursive: true }),
  ]);
  await ensureFile(mcpConfigPath(), `${JSON.stringify(DEFAULT_MCP_CONFIG, null, 2)}\n`);
}
```

It creates three empty directories and seeds `mcp.json` with one default server entry
(`web-search`, resolved via `fileURLToPath` relative to this module's own compiled location, so it
works wherever bubble-tea itself is installed — see
[10-mcp-integration.md](10-mcp-integration.md)). It does **not** create `sessions/` — that
directory is created lazily, the first time `appendRecord` actually needs it (`mkdir(dir, {
recursive: true })` inline in `state/store.ts`). It also does **not** seed `hooks/config.json` —
that's `loadHooksConfig()`'s job, called separately, and only on first read (see
[04-execution-loop-and-hooks.md](04-execution-loop-and-hooks.md)). Three different modules, three
different "first run" moments — worth knowing when debugging why a fresh `~/.bubbletea/` looks
different right after install vs. after the first real conversation.

## Frontmatter: one tiny parser, two consumers

Both skills and agent definitions are Markdown files with a YAML-like header. Rather than pull in a
YAML dependency for `key: value` pairs, there's one minimal parser:

```ts
// src/config/frontmatter.ts
const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
export function parseFrontmatter(raw: string): ParsedFrontmatter {
  const match = FRONTMATTER_PATTERN.exec(raw);
  if (!match) return { data: {}, body: raw.trim() };
  const [, header, body] = match;
  const data: Record<string, string> = {};
  for (const line of header.split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key) data[key] = value;
  }
  return { data, body: body.trim() };
}
```

Flat `key: value` lines only — no nesting, no lists, no quoting rules. Enough for
`name:`/`description:`/`tools:`/`model:` headers and nothing more, which is all skills and agents
currently need.

## Skills

```ts
// src/config/skills.ts
export async function loadSkills(): Promise<SkillDefinition[]> {
  // readdir ~/.bubbletea/skills/ — missing dir means "no skills", not an error
  // for each subdirectory, read <name>/SKILL.md, parse frontmatter
  // { name: data.name ?? entry, description: data.description ?? "", body }
}
```

Loaded once at startup (`src/cli.ts`) and passed down to `App` as a plain array. **Skills are
injected only via an explicit `@skill-name` mention**, resolved by `expandMentions` (see
[01-end-to-end-turn.md](01-end-to-end-turn.md) step 3 and
[07-commands-and-mentions.md](07-commands-and-mentions.md)) — there is no automatic
task-matched injection, even though earlier design notes in `artifacts/implementation-process.md`
mention that as a possibility. `InputBox` surfaces skill names in its `@` autocomplete alongside
agent names, so discovering what's available doesn't require memorizing filenames.

## Agent definitions

```ts
// src/agents/types.ts
export interface AgentDefinition {
  name: string;
  description: string;
  systemPrompt: string;
  allowedTools?: string[];  // undefined = every tool the caller has registered
  model?: string;           // undefined = caller's default model
}
```

```ts
// src/agents/loader.ts
export async function loadAgentDefinitions(): Promise<AgentDefinition[]> {
  const byName = new Map(BUILTIN_AGENTS.map((a) => [a.name, a]));
  // readdir ~/.bubbletea/agents/*.md, parse frontmatter, byName.set(name, {...})
  return [...byName.values()];
}
```

Built-ins load first into a `Map` keyed by name; user-defined `.md` files under
`~/.bubbletea/agents/` are read after and **overwrite** any built-in with the same name — so the
shipped `plan` agent can be fully redefined (different prompt, different tool access, different
model) without touching source, just by dropping a `plan.md` in that directory.

The one built-in today, `plan` (`src/agents/builtin.ts`):

```ts
{
  name: "plan",
  description: "Reads the codebase and produces an implementation plan without editing anything.",
  systemPrompt: "You are a planning agent. Investigate the codebase using the read-only tools available to you...",
  allowedTools: ["read_file", "list_dir"],
}
```

No `write_file` or `bash` in `allowedTools` — it's structurally incapable of editing anything,
regardless of what the model decides mid-run, because the loop it runs under is built from
`registry.subset(["read_file", "list_dir"])`, not the full registry (see
[09-agent-runtime-and-background-tasks.md](09-agent-runtime-and-background-tasks.md)).
