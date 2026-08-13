The guiding principle, straight from the Claude Code build-order research: **get one thin,
working loop end-to-end before adding any safety, UI polish, or extensibility.** Every phase after
Phase 1 wraps the same loop; nothing in Phase 1 should have to be rewritten later.

### Phase 1 — Core skeleton (prove the loop works)
1. Project scaffold (TS project, CLI bin entry, build/dev scripts).
2. Provider abstraction: one internal `Provider` interface (`chat()`, `stream()`, tool-call
   parsing) with an OpenRouter adapter first (OpenAI-compatible REST — least friction), then a
   Gemini adapter (`@google/genai`, native function calling).
3. Minimal tool registry with 3–4 built-ins: `read_file`, `write_file`, `bash`, `list_dir`.
4. Core execution loop: single-threaded plan→act→observe cycle against a plain readline CLI (no
   TUI yet) — this is the fastest way to validate provider + tools + loop together before
   investing in rendering.

