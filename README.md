# DCP for OpenCode v2

Dynamic Context Pruning (DCP) is a local fork of `@local/opencode-dcp`. It reduces token
usage in OpenCode v2 by summarizing stale conversation content and pruning redundant tool
output. It is not published to npm and does not auto-update.

![DCP in action](assets/images/dcp-demo9.png)

## Requirements

- OpenCode v2
- Node.js and pnpm (the repo pins `pnpm@12.14.0` in `package.json`)
- Git

## Install

```bash
git clone https://github.com/feiudfyg/dcp-next.git <path>
cd <path>
pnpm install --frozen-lockfile
pnpm run build
```

Add the checkout root to OpenCode's `plugins` array. Edit the global config
(`~/.config/opencode/opencode.json` or `.jsonc`) or a project config:

```jsonc
{
    "plugins": ["/absolute/path/to/dcp-next"],
}
```

On Windows, use forward slashes, for example `"C:/Tools/dcp-next"`. Restart OpenCode and
check that `opencode plugin list` contains `opencode-dcp`. See [INSTALL.md](INSTALL.md) for
the full installation, update, and troubleshooting guide.

## What it does

- **Compress** replaces closed conversation spans with technical summaries. `range` mode
  is the default; `message` mode is experimental. Prior summaries can be nested or
  explicitly replaced when `compress.allowPriorSummaryDrop` is enabled.
- **Deduplication** keeps only the newest output for repeated tool calls with identical
  arguments.
- **Purge errors** removes the input of errored tool calls after a configurable number of
  turns while keeping the error itself.
- **Nudges** ask the model to compress when context usage or conversation length grows.

Deduplication and error purging are recalculated when compression runs. DCP does not
rewrite your session transcript; pruning is applied to the outgoing request.

## Usage

- `/dcp-panel` opens the control panel. It shows context and stats and provides Sweep,
  Decompress, Recompress, Compress, and Help.
- `/dcp-compress [focus]` asks the model to run one compression pass. Optional focus text
  directs what to compress.

Both commands require `commands.enabled` (default `true`); `/dcp-compress` is also
unavailable when `compress.permission` is `deny`. Manual mode stops autonomous compression;
automatic deduplication and error purging still run by default.

## Configuration

DCP reads these files, with later layers taking precedence:

1. `$XDG_CONFIG_HOME/opencode/dcp.jsonc` or `~/.config/opencode/dcp.jsonc`
2. `$OPENCODE_CONFIG_DIR/dcp.jsonc`
3. The nearest `.opencode/dcp.jsonc` found while walking up from the project directory

`.json` is also accepted. The global file is created automatically on first run. Arrays
such as `protectedTools` and `protectedFilePatterns` are merged, not replaced.

Common defaults:

| Setting                       | Default    |
| ----------------------------- | ---------- |
| `compress.mode`               | `range`    |
| `compress.permission`         | `allow`    |
| `compress.minContextLimit`    | `50000`    |
| `compress.maxContextLimit`    | `100000`   |
| `manualMode.enabled`          | `false`    |
| `strategies.deduplication`    | `true`     |
| `strategies.purgeErrors`      | `true`     |
| `experimental.allowSubAgents` | `false`    |
| `pruneNotification`           | `detailed` |

Example:

```jsonc
{
    "compress": {
        "mode": "range",
        "permission": "allow",
        "minContextLimit": 50000,
        "maxContextLimit": 100000,
    },
    "strategies": {
        "deduplication": { "enabled": true },
        "purgeErrors": { "enabled": true, "turns": 4 },
    },
}
```

The full configuration schema is in [`dcp.schema.json`](dcp.schema.json). Restart OpenCode
after changing configuration. For smaller-context models, lower
`compress.minContextLimit` and `compress.maxContextLimit`.

### Protected content

These tools are protected from pruning by default: `task`, `subagent`, `skill`,
`todowrite`, `todoread`, `compress`, `batch`, `plan_enter`, `plan_exit`, `write`, `edit`.

`compress.protectedTools` defaults to `task`, `subagent`, `skill`, `todowrite`, and
`todoread`; their outputs are appended to compression summaries. Add tool names or glob
patterns to `protectedTools`, or use `protectedFilePatterns` for file-based tools.

### Prompt overrides

The editable prompts are `system`, `compress-range`, `compress-message`,
`context-limit-nudge`, `turn-nudge`, and `iteration-nudge`. Overrides are read from:

1. `.opencode/dcp-prompts/overrides/` (project)
2. `$OPENCODE_CONFIG_DIR/dcp-prompts/overrides/`
3. `$XDG_CONFIG_HOME/opencode/dcp-prompts/overrides/` or
   `~/.config/opencode/dcp-prompts/overrides/` (global)

Copy the matching file from [`prompts/`](prompts), edit it, and restart OpenCode. Managed
defaults and a reference README are mirrored to the global config directory under
`dcp-prompts/defaults/`.

## Development

```bash
pnpm run typecheck
pnpm test
pnpm run build
pnpm run verify:package
pnpm run format:check
pnpm run dcp -- --list
```

Pruning changes the request prefix, so it can reduce prompt-cache hits. The trade-off is
usually worthwhile in long sessions.

## License

AGPL-3.0-or-later
