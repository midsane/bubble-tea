# TUI improvements breakdown: mascot + command prefix matching

`artifacts/improve_TUI.md` asks for two things: a small ASCII mascot ("bubble tea," Ferris-the-crab
style branding) and visibility into matching commands as the user types a `/command` prefix. Per
the project's stated philosophy ("we are not gonna build a very complex version" —
`architecture.md`), both are scoped to the simplest thing that satisfies the ask: a hint list, not
full Tab-to-accept autocomplete; a one-shot splash, not a persistent header.

## 1 — `matchCommands` utility (no Ink involved)

Add `src/commands/suggest.ts`:

```ts
export function matchCommands(commands: Command[], prefix: string): Command[]
```

Decisions, pinned now so step 2 doesn't stall on them:
- Case-insensitive compare.
- `prefix === ""` returns **all** commands, in registry (`list()`) order — this is what makes
  typing a bare `/` show the full command menu, the highest-value moment of the feature.
- Matches preserve `list()` order (registration order), not alphabetical.
- No cap inside this function — capping the rendered list is step 2's concern (a rendering
  decision), not this function's.

**Exit criteria:** a standalone script exercises `matchCommands` against a **synthetic** command
list (the real registry can't reach the multi-match branch — see below), e.g.
`[{name:"session"}, {name:"set"}, {name:"seed"}, {name:"new"}]`:
- `matchCommands(cmds, "se")` → `[session, set, seed]`, in that order.
- `matchCommands(cmds, "SE")` → same result (case-insensitive).
- `matchCommands(cmds, "")` → all 4, in original order.
- `matchCommands(cmds, "zz")` → `[]`.

Also run it once against the real registry (`commands.list()`, `"s"`) and confirm it returns
exactly `[session]` — document that as the expected real-world behavior, not a shortfall of the
function: `session`, `new`, `compact`, `help`, `tasks`, `plan`, `eval` all have distinct first
letters, so every single-character prefix in actual usage resolves to 0 or 1 match today. The
multi-match path only matters once more commands are added later, or for 2+ character prefixes
against similarly-prefixed future commands — still worth building correctly now rather than
hardcoding "return first match."

## 2 — Wire hints into `InputBox`

Change `InputBox`'s prop shape to `{ busy, onSubmit, commands }: { busy: boolean; onSubmit: (v: string) => void; commands: Command[] }`. `App.tsx` already holds `commands: CommandRegistry` — it passes `commands={commands.list()}`. `commands.list()` is 7 items; recomputing it on every `App` render is cheap enough that no memoization is warranted at this scale.

Do **not** lift `value` out of `InputBox` into `App`. `InputBox` keeps owning its own `value`
state and computes matches locally:

```
prefixVisible = value.startsWith("/") && !value.includes(" ")
matches = prefixVisible ? matchCommands(commands, value.slice(1)).slice(0, 5) : []
```

Render the hint list as a dim row (or short stack) below the existing input `Box`, inside a new
outer `<Box flexDirection="column">` wrapping both. Cap at 5 rendered rows (matters once real
usage produces more than a handful of matches).

Deliberately **hint-only, no Tab-to-accept**: `ink-text-input`'s `useInput` subscription doesn't
exclusively capture keys — Ink's `useInput` broadcasts to every subscriber, and `TextInput` doesn't
stop propagation. A sibling Tab handler would fire *and* `TextInput` would fold the same keypress
into `value`, corrupting input. This is a real conflict, not a hypothetical one, and is why this
step stays pure prop-driven rendering with no new `useInput` subscription. Tab-acceptance is
explicitly deferred — pursuing it later would require forking or replacing `ink-text-input`.

**Exit criteria:** run `npm run dev` and observe real, not synthetic, behavior:
- Typing `/` alone shows all 7 registered commands.
- Typing `/s` shows exactly one hint row: `/session`.
- Typing `/session ` (trailing space, args starting) makes the hint list disappear — the state
  machine (`startsWith("/") && !includes(" ")`) correctly reads this as "past the command name."
- Typing a non-`/`-prefixed line shows no hint row at all, and normal submission is unaffected.

Do not write an exit criterion promising a multi-row hint list from real usage against the live
registry — the current command set can't produce one, and a criterion promising it would read as a
failed step later.

## 3 — Mascot / banner (`src/tui/Mascot.tsx`)

Render once, not persistently. Use Ink's `<Static>`: confirmed via reading
`node_modules/ink/build/components/Static.js` directly — it tracks an internal `index` = count of
items already flushed, and re-slices `items.slice(index)` on every render; once a 1-length items
array has been flushed, `itemsToRender` is `[]` on every subsequent render regardless of `App`
re-rendering (busy toggling, new messages, etc.) or the `items` array being a fresh literal each
time. Passing `items={["mascot"]}` inline in JSX is therefore safe — no memoization needed.

```tsx
export function Mascot() {
  return (
    <Static items={["mascot"]}>
      {() => (
        <Box key="mascot" flexDirection="column">
          <Text color="cyan">{ASCII_ART}</Text>
        </Box>
      )}
    </Static>
  );
}
```

Mount `<Mascot />` as the first child inside `App`'s outer `<Box flexDirection="column">`, above
`<MessageStream>`. Because it's `<Static>`, it paints once at startup, then scrolls into normal
terminal scrollback like a splash screen — it does not occupy fixed rows in the live/re-rendered
region for the rest of a long-running session, and is never repainted.

**Exit criteria:** run `npm run dev` — the mascot art prints once at the top of the terminal on
startup; send several messages; the mascot is not re-rendered or duplicated, and scrolls up into
scrollback exactly like a one-time banner, not a fixed header.

## 4 — Error-flavored notices (optional, unrequested scope)

Not part of the original ask, included because it's cheap and directly serves the "improve the TUI
sufficiently" framing: right now a thrown error and a routine informational notice (e.g.
`/compact`'s output, a background task result) render identically — same yellow `notice` styling —
so a real failure is easy to miss.

Instead of adding `"error"` to `DisplayItem["role"]` — which is an **exhaustive** union consumed by
`MessageStream.tsx`'s `Record<DisplayItem["role"], ...>` lookups (`COLORS`, `LABELS`), meaning that
change breaks compilation everywhere until both records are updated — add a narrower, additive
field instead:

```ts
export interface DisplayItem {
  key: string;
  role: "user" | "assistant" | "tool" | "notice";
  text: string;
  tone?: "info" | "error"; // only meaningful when role === "notice"
}

export function notice(text: string, tone: "info" | "error" = "info"): DisplayItem { ... }
```

`MessageStream` reads `item.tone === "error" ? "red" : COLORS[item.role]` for the `notice` role
only. `App.tsx`'s catch-block calls become `notice(..., "error")`; existing informational notices
(compaction, background task results) stay `notice(...)` (default `"info"`, yellow, unchanged).
This is strictly additive — no exhaustive union to touch, no risk of breaking `MessageStream`'s
existing `Record` lookups.

**Exit criteria:** `tsc --noEmit` is clean with no changes required in `MessageStream.tsx`'s
`COLORS`/`LABELS` records; triggering a thrown error (e.g. an unknown tool call) renders red;
existing informational notices (e.g. `/compact`'s output) remain yellow.

## Why this order

- **1 before 2** — same "logic before UI" principle `phase2-breakdown.md` already applies to Ink
  itself: prove `matchCommands` against a scriptable synthetic list before wiring it into a
  component that's hard to verify without a human watching it type.
- **2 before 3** — command discoverability is the functionally load-bearing half of the ask (helps
  every future session); the mascot is cosmetic and has no dependency on 1–2, so ordering it after
  costs nothing and keeps the higher-value step first.
- **3 before 4** — 4 is scope the user didn't ask for; sequencing it last means it can be dropped
  entirely without unpicking 1–3, and it's genuinely independent (it touches `display.ts`, which
  1–3 never touch).

## Known limitation, unrelated to this work

`MessageStream` has no scroll/height management today and will exceed terminal height and get
clipped in any sufficiently long real session. None of steps 1–4 make this better or worse — the
mascot is a one-shot splash via `<Static>`, not a persistent header, specifically so it doesn't add
to this. Worth documenting so it's a known limitation, not a surprise found later.
