# 05 — Append-only files, JSON Lines, and machine-root config directories

## Append vs. rewrite: two very different failure modes

Persisting a growing piece of state to disk has two basic strategies:

1. **Rewrite the whole file** every time it changes (e.g. read a JSON array, push one item, write
   the whole array back out). Simple, but the file is briefly invalid mid-write — a crash or power
   loss between "start writing" and "finish writing" can leave a truncated, unparseable file, and
   every update costs O(total size) I/O even to add one small record.
2. **Append only** — never read-modify-write the existing content, only ever add new bytes at the
   end. A crash mid-append can at worst leave one incomplete trailing record; everything written
   before it stays intact and parseable. Each write is O(1) relative to the file's total size.

`appendRecord` (`src/state/store.ts`) uses `appendFile`, strategy 2, for exactly this durability
reason — a session transcript that's actively being written to (every turn, potentially every
model response) is a bad candidate for the rewrite-the-whole-file approach.

## JSON Lines (JSONL): why not one big JSON array

A single JSON array (`[ {...}, {...}, {...} ]`) can't be appended to safely — you'd have to seek
back before the closing `]`, which reintroduces the rewrite problem. **JSON Lines** sidesteps this:
one complete, independently-parseable JSON value per line, no enclosing array, no trailing comma
bookkeeping:

```
{"type":"message","id":"...","role":"user","content":"hello"}
{"type":"message","id":"...","role":"assistant","content":"hi there"}
```

Appending a new record is just: write the JSON, write `\n`. Reading the whole file back is: split
on `\n`, `JSON.parse` each non-empty line (`src/state/store.ts`'s `readSession`). It's also
directly `cat`-able and `jq`-able for debugging — you can inspect a session's history with normal
Unix tools, no custom deserializer needed to even look at it.

## Machine-root config directories: the `~/.claude` / `~/.bubbletea` convention

Two different places configuration can live:

- **Project-local** (e.g. a `.eslintrc` next to your code) — travels with the repo, different per
  project, checked into version control.
- **Machine-root / user-root** (e.g. `~/.gitconfig`, `~/.ssh/`, `~/.claude`) — one copy per user
  account on the machine, shared across every project that user works in, deliberately **not**
  checked into any repo.

bubble-tea's `~/.bubbletea/` follows the second pattern, explicitly per `architecture.md`'s spec —
skills, agent definitions, hook rules, and MCP server config are things you'd reasonably want
available in *every* project you use this harness on, not redefined per-repo. Session transcripts
additionally get **namespaced by project** underneath that shared root
(`~/.bubbletea/sessions/<projectKey>/`) — shared root, but still per-project data, which is why
`projectKey()` (cwd with `/` replaced by `-`) exists at all: it's what keeps one user's sessions
across many different projects from colliding in a single shared directory.

This is the same shape as tools like `systemd` (`/etc/systemd/` machine-wide vs. a project's own
service files), package managers (`~/.npm/` global cache vs. a project's `node_modules/`), or
editors (`~/.vimrc` vs. project-local `.editorconfig`) — a recurring Unix convention for
"configuration that belongs to the user/machine, not to any one checkout of a repo."
