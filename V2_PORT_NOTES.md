# DCP v2 port — working notes

Living document for the OpenCode v2 port on branch `v2`. Keep it current as we
iterate (plan → test → fix → commit).

## Goal

Make `@local/opencode-dcp` run natively on **OpenCode v2** (branch `v2`, the
default branch), with no obvious defects/regressions versus the v1 branch
(`dcp-next-v1`).

## Repo facts

- Repo: `E:\CodeProjects\dcp-next` (branch `v2`). v1 preserved at `E:\CodeProjects\dcp-next-v1`.
- Verify: `pnpm run typecheck` · `pnpm test` (161 tests) · `pnpm run build` · `pnpm exec prettier --check .`.
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

- Root: `E:\CodeProjects\opencode-v2-test` (opencode `@opencode/cli@2.0.28`). **Durable**
  harness (survives temp cleanup): `oc2run.ps1` + `e2e-v2.ps1` live in this dir.
- API key: `.secrets\deepseek.key` (git-ignored; dir is not a repo) and the persistent
  user env var `DEEPSEEK_API_KEY`. `e2e-v2.ps1` resolves key as `-Key` → env → file.
- Runner `oc2run.ps1`: redirects HOME/USERPROFILE/APPDATA/LOCALAPPDATA + XDG into
  `home`; .NET process with `WaitForExit(timeout)` + `Kill($true)` and async
  `ReadToEndAsync` capture (the background service would hang a normal wait).
  Auto-appends `--standalone` for `run`.
- Usage:
  `pwsh -NoProfile -File E:\CodeProjects\opencode-v2-test\e2e-v2.ps1 -Phase {1,2,3,4}`
  phases: 1 multi-tool, 2 `/dcp-compress`, 3 subagent, 4 ping. After the run it dumps
  DCP blocks (id/active/range/ct/st/dur/topic) from the sandbox state JSON.
- Sandbox config `home\.config\opencode\opencode.json`: model `deepseek/deepseek-flash#medium`,
  `plugins: ["E:/CodeProjects/dcp-next"]`.
- Sessions live in `home\.local\share\opencode\opencode.db` (SQLite); inspect with
  `node -e` + `node:sqlite` (read-only). DCP state: `storage\plugin\dcp\ses_*.json`.
- Observed v2 tool names: `read`, `execute`, `write`, `glob`, `subagent`
  (v1 called the subagent tool `task`). v2 `subagent` tool metadata: `{ sessionID, status }`.

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
- [x] Subagent-result expansion works on v2 (`task` tool metadata uses `sessionID`, not `sessionId`).
- [x] Notification sink bridge (`session.synthetic`/toast) unit-tested; delivery failures are caught (no unhandled rejection).
- [x] Compaction reset detects the marker from `session.context()` (not just the request projection).
- [x] Subagent tool recognised under both v1 (`task`) and v2 (`subagent`) names; protected by default. Verified live (subagent output kept in a stored block summary).
- [x] v1 + v2 context handlers share one `runMessagePipeline` (no drift).
- [x] DCP's own `session.synthetic` notifications are excluded from the outgoing request (they persist in the transcript and were re-sent to the model every turn).
- [x] Dead v1 code removed: `createSystemPromptHandler`, `createChatMessageTransformHandler`,
      `createCommandExecuteHandler`, `createTextCompleteHandler`, `createEventHandler`,
      `resolveCompressionDuration`, `filterMessagesInPlace`, and `lib/auth.ts` (all test-only
      or unreferenced after the v2 port). Tests consolidated into `tests/hooks.test.ts` + `tests/tool-timing.test.ts`.
- [ ] TUI: cannot be runtime-verified headless (host TUI exits with `chdir` on an
      empty path without a real terminal). Covered by `tui-context`/`tui-setup` unit
      tests + a static audit of every `api.*` call against the compat layer.
- [ ] Long-session / compaction rollover not yet exercised in a live run (needs E2E).
- [ ] `experimental.text.complete` hallucination stripping removed (minor; no v2 equivalent).
- Intentional removals: npm auto-update, secure-mode auth interceptor.

## Sandbox model/auth (for E2E)

- The free `opencode/big-pickle` model refuses outside the app; the sandbox needs a
  real key via env: `DEEPSEEK_API_KEY` (the v2 `auth.json` format is not honoured).
- Sandbox `opencode.json` defines `provider.deepseek.models.deepseek-flash` with
  variants `max` and `medium`; tests run `-m deepseek/deepseek-flash#medium`.
- Harness: `E:\CodeProjects\opencode-v2-test\e2e-v2.ps1` (phases 1-4) and
  `e2e-long.ps1` (N-turn session). Both set the key and dump DCP blocks.
- Note: the provided key is a rate-limited "governor"; bursts of runs eventually
  return `HTTP 401 Authentication Fails (governor)` — a provider-side limit, not
  a DCP defect. Wait it out or use another key.

## Iteration plan (current)

1. Adapter unit tests + role-aware alignment fix.
2. Timing restoration via tool hooks + test.
3. TUI adapter unit tests.
4. Isolated v2 end-to-end (multi-step + attachment) after each batch.
5. Commit per fix; keep the 4 green checks.

## Command recipes

- Typecheck+test+build+format:
  `pnpm run typecheck; pnpm test; pnpm run build; pnpm exec prettier --check .`
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
- `getSubAgentId` accepts both `metadata.sessionId` (v1) and `metadata.sessionID` (v2);
  `injectExtendedSubAgentResults` + notification sink covered by new tests.
- `resolveNotify` now returns (awaits) the delivery promise instead of `void`, so
  `sendIgnoredMessage`'s try/catch actually catches failures.
- `checkSession`/`ensureSessionInitialized` take an optional `compactionSource`;
  the v2 context hook passes the normalized `session.context()` transcript so
  compaction resets fire even when the request projection lacks the marker.
  Tests: `tests/compaction-reset.test.ts`.
- Long-transcript alignment stress test (`tests/v2-alignment-stress.test.ts`):
  a 30-turn id-less request/session pair (with interleaved `role:"tool"` messages)
  maps every turn to the right session id and rebuilds one tool message per call.
- `isSubAgentTool` accepts `task`/`subagent`; used by the subagent injector and
  `protected-content`; `subagent` added to the default protected-tools list.
- Both context handlers now call one `runMessagePipeline` (v2 adds
  `refreshPermissions`, `compactionSource`, and an `afterPermission` system-prompt hook).
- `resolveTheme` reads v2 theme tokens defensively (falls back to `text.base`),
  so a sparse/different theme cannot crash panel setup.
- `lib/dcp-marker.ts` marks DCP notifications; `filterDcpNotificationMessages`
  drops them from the v2 request and `normalizeSessionMessages` skips them
  (found via a live request dump: 19 synthetic "▣ DCP | …" user messages were
  being re-sent every turn). Tests in `tests/v2-adapter.test.ts`.
- Live 12-turn session (`e2e-long.ps1`): 12 sequential blocks, all with
  durations, no adapter/pipeline warnings; stable `msg_*` ids (id-based
  correlation confirmed, positional is a fallback).
- Compression **quality/ratio** test (`e2e-quality.ps1`, Aurora facts):
    - Phase A (30→1): compression denied while 10 fact-turns accumulate, then one
      manual compress → 1 block `m0001..m0041` ct=4722 st=842 **ratio 5.6x**; summary
      keeps all 10 facts verbatim + task shape + caveats.
    - Phase B (short→one): small blocks then consolidation → b4 consumed [2,3],
      b8 consumed [5,6,7], b9 consumed [1,4,8]; only b9 active, ct=7184 st=890
      **ratio 8.1x**. Nested re-compression + `included`/`consumed` chains correct.
- Ordering fix: `modelContextLimit` is now applied inside `runMessagePipeline`
  after `checkSession` (a fresh session's `resetSessionState` was wiping the
  limit set just before it). Covered by `tests/hooks.test.ts`.
