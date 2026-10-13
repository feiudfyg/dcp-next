# DCP v2 port — working notes

Living document for the OpenCode v2 port on branch `v2`. Keep it current as we
iterate (plan → test → fix → commit).

## Goal

Make `@local/opencode-dcp` run natively on **OpenCode v2** (branch `v2`, the
default branch), with no obvious defects/regressions versus the v1 branch
(`dcp-next-v1`).

## Repo facts

- Repo: `E:\CodeProjects\dcp-next` (branch `v2`). v1 preserved at `E:\CodeProjects\dcp-next-v1`.
- Verify: `npm run typecheck` · `npm test` (134 tests) · `npm run build` · `npx prettier --check .`.
- v2 loads the plugin **from source** (`entrypoint=file:///…/index.ts`), so edits
  take effect without rebuilding; `dist/` is only for packaged use.

## Architecture (v2)

- Entry: `index.ts` → `Plugin.define({ id, async setup(ctx) })`.
    - `ctx.session.hook("context", …)` owns **both** system prompt (`event.system`)
      and messages (`event.messages`).
    - `ctx.tool.transform` registers `compress` (JSON Schema `input`, `execute → {content}`).
    - `ctx.command.transform` registers `dcp-compress`.
    - `ctx.permission.hook("evaluate")` maps DCP permission → effect.
- Message model: DCP's own `{ info, parts }` in `lib/state/types.ts` (no `@opencode-ai/*`).
- Adapter: `lib/v2/messages.ts`
    - `normalizeSessionMessages(SessionMessage.Info[]) → WithParts[]`
    - `requestToInternal(requestMessages, sessionMessages, sessionID) → WithParts[]`
    - `internalToRequest(internal, original) → requestMessages[]`
    - Unknown parts (media/compaction/effort/…) = `opaque` parts, round-tripped verbatim.
    - Tool results are emitted as separate `role:"tool"` messages.
- TUI: `tui.tsx` → `Plugin.define`; `lib/tui/context.ts` wraps `Plugin.Context`
  into the stable `TuiApi`; `lib/tui/types.ts` maps `ResolvedTheme` → flat `Theme`.

## Isolated v2 sandbox (for tests)

- Root: `E:\CodeProjects\opencode-v2-test` (opencode `@opencode/cli@2.0.28`).
- Launcher: `oc2.ps1` (sets XDG only). Hardened runner:
  `C:\Users\24635\AppData\Local\Temp\opencode\oc2run.ps1`
    - redirects `HOME`/`USERPROFILE`/`APPDATA`/`LOCALAPPDATA` + XDG into the sandbox;
    - .NET process with `WaitForExit(timeout)` + `Kill($true)` → never hangs on the
      background service; returns in ~0.4s.
    - Usage: `pwsh -NoProfile -File oc2run.ps1 -TimeoutMs 150000 -WorkDir <dir> run --print-logs --log-level warn -m opencode/big-pickle --auto "<prompt>"`
- Sandbox config: `home\.config\opencode\opencode.json` →
  `{ "model": "opencode/big-pickle", "plugins": ["E:/CodeProjects/dcp-next"] }`.
- DCP state lands in `home\.local\share\opencode\storage\plugin\dcp\ses_*.json`.
- Verified: plugin loads, system prompt injected, prune/rebuild works, `compress`
  executes and persists a real block, follow-up turn OK.

## Status checklist

Legend: [x] done · [~] partial · [ ] todo · [!] regression

- [x] Plugin loads from source under v2 (type-only imports fixed).
- [x] Assistant tool-results emitted as `role:"tool"` messages.
- [x] Opaque parts (media/compaction/effort) round-tripped (was data loss).
- [x] Basic `run` end-to-end with a real compression.
- [x] Adapter unit tests (round-trip + correlation).
- [x] Role-aware request↔session alignment (tool-message safe).
- [x] Compression duration/timing restored via `ctx.tool.hook("execute.before"/"execute.after")`.
- [x] System/effort control messages preserved verbatim (were coerced to `user`, breaking OpenAI Chat).
- [x] TUI adapter unit tests (`resolveTheme`, `createTuiApi`) + `tui.tsx` setup smoke test.
- [x] Isolated v2 E2E: compress → block with `durationMs`, follow-up turn rebuilds the pruned request.
- [x] Host/agent compress permission synced from `context.agent.list()` (nudges respect agent deny).
- [ ] Long-session / compaction / subagent correlation not stress-tested.
- [ ] `experimental.text.complete` hallucination stripping removed (minor; no v2 equivalent).
- Intentional removals: npm auto-update, secure-mode auth interceptor.

## Sandbox model/auth (for E2E)

- The free `opencode/big-pickle` model refuses outside the app; the sandbox needs a
  real key via env: `DEEPSEEK_API_KEY` (the v2 `auth.json` format is not honoured).
- Sandbox `opencode.json` defines `provider.deepseek.models.deepseek-flash` with
  variants `max` and `medium`; tests run `-m deepseek/deepseek-flash#medium`.
- Harness: `C:\Users\24635\AppData\Local\Temp\opencode\e2e-v2.ps1 -Phase {1,2}`
  sets the key, runs the sandbox, then dumps DCP blocks (ct/st/durMs).

## Iteration plan (current)

1. Adapter unit tests + role-aware alignment fix.
2. Timing restoration via tool hooks + test.
3. TUI adapter unit tests.
4. Isolated v2 end-to-end (multi-step + attachment) after each batch.
5. Commit per fix; keep the 4 green checks.

## Command recipes

- Typecheck+test+build+format:
  `npm run typecheck; npm test; npm run build; npx prettier --check .`
- Inspect a sandbox DCP session:
  `node -e "const fs=require('fs');const j=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));console.log(JSON.stringify(j.prune.messages.blocksById,null,2))" <path>`

## Fix log

- `ed799d0` source-loading (`verbatimModuleSyntax`, `import type`/`export type`),
  assistant tool-result split into `role:"tool"`.
- `c9d3672` opaque part round-trip (media/compaction/effort preserved).
- `f46c06b` role-aware request↔session alignment + adapter unit tests.
- `51734f6` compression timing restored via tool execute hooks.
- `e12a8cf` TUI adapter + setup wiring tests.
- system/effort control messages skipped internally and re-inserted verbatim in
  `internalToRequest` (fixes OpenAI Chat "only support text and media").
- `2bd03d2` agent permissions mapped into the host snapshot (v2 `agent.list()`).
