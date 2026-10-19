# Agent guide: installing DCP from this repository

This document is written for an AI agent that is helping a user install Dynamic Context
Pruning (DCP) from this Git repository. Follow it in order, preserve the user's existing
configuration, and verify each step instead of assuming it succeeded.

## Scope

- Supported target: **OpenCode v2** (`opencode --version` reports `2.x`).
- Supported install source: a **local clone of this repository**.
- This repository is a private, self-maintained fork. It is not published to npm and does
  not ship `dist/`. Do not substitute an npm package or an `opencode plugin add` Git
  package for the local-clone procedure below.

## 1. Confirm the plan with the user

Before changing anything, establish:

1. Whether the plugin should be enabled **globally** (recommended) or for **one project**.
2. Where the repository should live. Prefer a stable, user-owned directory outside the
   project being worked on, for example:
    - Windows: `C:/Tools/dcp-next`
    - macOS/Linux: `~/Tools/dcp-next`
3. Whether the user already has an OpenCode config with other plugins. Existing plugin
   entries must be kept.

Ask before modifying a global config file or deleting anything. Do not read, print, or
commit API keys or other credentials.

## 2. Check prerequisites

Run and record the output of:

```bash
opencode --version
node --version
pnpm --version
git --version
```

Requirements:

- OpenCode **v2**. This fork uses the v2 `plugins` array and the v2 plugin API; it will
  not work on OpenCode v1.
- Node.js and pnpm capable of building the project.
- Git.

If OpenCode is v1, stop and explain that the user must install OpenCode v2 first.

## 3. Clone and build

Choose the install directory, then run:

```bash
git clone https://github.com/feiudfyg/dcp-next.git <install-directory>
cd <install-directory>
pnpm install --frozen-lockfile
pnpm run build
```

Notes:

- Use `pnpm install` without `--frozen-lockfile` only when the lockfile is out of sync.
- Run the build even though OpenCode v2 can load the TypeScript entry directly. It
  validates the checkout and produces the packaged `dist/` output.
- Do not copy only `index.ts` or `dist/`. The plugin also needs `lib/`, `prompts/`,
  `tui.tsx`, and its installed dependencies.

Optional verification in the checkout:

```bash
pnpm test
pnpm run typecheck
pnpm run verify:package
```

## 4. Add the plugin to OpenCode

Use the **absolute path to the repository root**, not to `index.ts`, `dist/index.js`, or
`tui.tsx`.

### Global configuration (recommended)

The default global config is `~/.config/opencode/opencode.json` or
`~/.config/opencode/opencode.jsonc` (`~` is `%USERPROFILE%` on Windows). If
`OPENCODE_CONFIG` is set, edit the file it points to.

Merge this entry into the existing `plugins` array; do not replace the array:

```jsonc
{
    "$schema": "https://opencode.ai/config.json",
    "plugins": ["C:/Tools/dcp-next"],
}
```

Unix example:

```jsonc
{
    "$schema": "https://opencode.ai/config.json",
    "plugins": ["/Users/me/Tools/dcp-next"],
}
```

- Use forward slashes in JSON paths, especially on Windows.
- An absolute path is preferred. A `file://` URL such as
  `file:///C:/Tools/dcp-next` is also accepted.
- Do not use `~` inside the JSON value; expand it to a real absolute path.
- The config key is `plugins` (plural) in OpenCode v2.

### Project-only configuration

Add the same entry to the project's `opencode.jsonc`, `.opencode/opencode.jsonc`, or the
config file selected by `OPENCODE_CONFIG`. The absolute path can point at a checkout
outside the project.

## 5. Restart OpenCode

Local plugin changes are not guaranteed to be picked up by a running process.

```bash
opencode service restart
```

If the user is in the terminal UI, also quit and reopen `opencode`. A full restart is
required after rebuilding the plugin.

## 6. Verify the installation

Run:

```bash
opencode plugin list
```

A successful local install includes a row similar to:

```text
opencode-dcp     local    C:\Tools\dcp-next\index.ts
```

Then, in the OpenCode TUI:

1. Confirm the slash command `/dcp-compress` is available.
2. Confirm `/dcp-panel` opens the DCP panel.
3. On first use, DCP creates its own config at `~/.config/opencode/dcp.jsonc`. Its
   presence, and a DCP state file under
   `~/.local/share/opencode/storage/plugin/dcp/`, are good signs that the plugin is
   running.

If `opencode plugin list` does not show `opencode-dcp`, fix that before testing
compression.

## 7. Report back to the user

Tell the user:

- the exact checkout path;
- which config file was edited and which entry was added;
- the output of `opencode plugin list`;
- whether the TUI commands are visible;
- how to update or uninstall (below).

Do not claim success based only on the build; verify the plugin is actually listed.

## Updating

From the checkout:

```bash
git pull --ff-only
pnpm install --frozen-lockfile
pnpm run build
opencode service restart
```

Restart the TUI as well. If the user needs reproducibility, check out a specific commit
or tag before building.

## Uninstalling

1. Remove the DCP entry from the `plugins` array. Keep all other entries.
2. Restart OpenCode (`opencode service restart`).
3. Optionally delete the checkout.
4. Optionally delete DCP user data, only with the user's approval:
    - config: `~/.config/opencode/dcp.jsonc`
    - state: `~/.local/share/opencode/storage/plugin/dcp/`
    - prompt overrides/defaults: `~/.config/opencode/dcp-prompts/`

## Troubleshooting

### `opencode-dcp` is missing from `opencode plugin list`

- Validate the JSON/JSONC syntax of the config file.
- Confirm the path is absolute, points at the repository root, and exists.
- Check whether `OPENCODE_CONFIG` or `OPENCODE_CONFIG_DIR` redirects the config.
- Restart the background service and the TUI.
- Confirm the OpenCode version is v2.

### The plugin loads but `/dcp-compress` or `/dcp-panel` is missing

- Confirm this is the terminal TUI, not a non-interactive `opencode run` session.
- Re-run `pnpm run build` and restart both the service and the TUI.
- Check that `tui.tsx` and the `lib/` directory are present in the checkout.
- DCP commands can be disabled in `~/.config/opencode/dcp.jsonc`; check
  `commands.enabled` and `compress.permission` (a `deny` value suppresses the compress
  command and tool).

### Compression never triggers

- Default thresholds are deliberately high (`minContextLimit` 50000,
  `maxContextLimit` 100000). Lower them for smaller-context models.
- Check `manualMode.enabled` and `compress.permission` in `dcp.jsonc`.
- Enable `debug: true` and inspect logs under `~/.config/opencode/logs/dcp/` if needed.

### Build failures

- Confirm `pnpm install --frozen-lockfile` completed in the checkout.
- Make sure the shell is using a supported Node.js/pnpm version.
- Do not run the plugin from a partially copied directory; re-clone if necessary.

## Safety rules for the agent

- Preserve unrelated config entries and comments where possible.
- Back up the config file before editing it if the user has no version control.
- Never print secrets from config, environment files, or auth stores.
- Never delete sessions, DCP state, or user data without explicit approval.
- State clearly which actions were taken and what remains for the user to do.
