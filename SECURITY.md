# Security

XMINAL is a terminal coding agent: it can read files, run shell commands and edit code. Safety is part of the product, not an afterthought.

## Reporting

Report vulnerabilities privately to the maintainers of the repository hosting this code (GitHub Security Advisory: "Security" tab → "Report a vulnerability"). Do not open public issues for security bugs.

## In scope

- Bypass of the permission engine (`ask` / `auto` / `full`)
- Writes to protected paths (`.env`, `~/.ssh`, `~/.aws`, `~/.gnupg`, `~/.config/gh`)
- Credential leakage: API keys entering prompts, logs, audit receipts, or session files
- Prompt-injection leading to unintended file writes or command execution
- MCP servers or skills exfiltrating data to unapproved endpoints

## Design guarantees

- Read-only tools (`read`, `glob`, `grep`, `list`, `task`, `memory`, `skill`, `web_fetch`, `web_search`) are always allowed.
- File edits and shell commands are classified `risky`/`dangerous`; dangerous actions require explicit approval and are denied without an approver.
- Protected paths are denied even in `full` mode.
- Every permission decision is recorded in `.xminal/receipts/audit.jsonl` with a SHA-256 hash chain. Verify with `xminal audit verify`.
- API keys are read from environment variables or keyring-style files only; XMINAL never prints them (tool output is truncated and redaction applies to common key formats).
- Network access is limited to providers you configure and opt-in web tools.

## Checkpoints

File edits create automatic checkpoints in `.xminal/checkpoints/`. Use `/undo` (or `xminal` rewind) to restore. Checkpoints stay on disk locally; delete them if you work with secrets.

## Environment checklist

- Run `xminal doctor` after changing providers or installing MCP servers.
- Keep `permissions.mode` at `auto` or `ask` on shared machines.
- Review `xminal audit tail` before trusting a long autonomous run.
