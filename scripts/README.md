# DCP Prompt Preview CLI

Dev tool for previewing the effective (post-override) DCP prompts.

## Usage

```bash
npm run dcp -- [options]
```

## Options

| Flag                | Description                                       |
| ------------------- | ------------------------------------------------- |
| `--list`            | List available prompt keys                        |
| `--show <key>`      | Print the effective prompt text for a key         |
| `--system`          | Print the effective system prompt (no extensions) |
| `--system-manual`   | System prompt with the manual-mode extension      |
| `--system-subagent` | System prompt with the subagent extension         |
| `--system-all`      | System prompt with both extensions                |
| `-h`, `--help`      | Show usage                                        |

Prompt keys: `system`, `compress-range`, `compress-message`, `context-limit-nudge`, `turn-nudge`, `iteration-nudge`.

## Examples

```bash
npm run dcp -- --list
npm run dcp -- --show compress-range
npm run dcp -- --system-all
```

## Purpose

This CLI does not ship with the plugin. It is for local DX while iterating on prompts and
overrides.
