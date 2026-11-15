# ACP — the Agent Client Protocol

XMINAL speaks the [Agent Client Protocol](https://agentclientprotocol.com) (ACP),
the open protocol that lets any editor — Zed, Cursor, Neovim, anything with an ACP
client — drive a real coding agent without a bespoke integration.

```sh
xminal acp
```

That is the whole command. It starts an ACP agent on **stdio**: newline-delimited
JSON-RPC 2.0, exactly like every other ACP agent. The client launches the process,
talks to it, and closes stdin when it is done.

---

## Wire it into an editor

### Zed

```json
{
  "context_servers": {
    "xminal": {
      "command": "xminal",
      "args": ["acp"]
    }
  }
}
```

### Cursor / any other ACP client

Point the client at the executable and the argument:

```
command: xminal
args:    acp
```

`xminal` must be on `PATH` (or use the absolute path to `dist/index.js`).

---

## What the agent offers

| ACP method | Supported | Notes |
|---|---|---|
| `initialize` | ✅ | Protocol v1, negotiates capabilities and auth methods |
| `authenticate` | ✅ | Provider keys live in `~/.xminal/config.json` — nothing to hand over |
| `session/new` | ✅ | Creates a session in the project, returns its id, modes and model picker |
| `session/load` | ✅ | Replays the whole conversation as `session/update` notifications |
| `session/resume` | ✅ | Restores a session without replaying history |
| `session/close` | ✅ | Cancels the turn and frees the session |
| `session/delete` | ✅ | Removes the session from disk |
| `session/list` | ✅ | Every session of the project |
| `session/prompt` | ✅ | The turn — streams reasoning, tool calls and the answer |
| `session/cancel` | ✅ | Aborts the turn, answers every open permission request |
| `session/set_mode` | ✅ | build · plan · review · compose · yolo |
| `session/set_config_option` | ✅ | The model picker and the effort picker |
| `session/set_model` | ✅ | Convenience alias for the model config option |

### Streaming

Every chunk of the turn arrives as a `session/update` notification:

| `sessionUpdate` | When |
|---|---|
| `agent_thought_chunk` | the model's reasoning |
| `agent_message_chunk` | the answer |
| `tool_call` | a tool is about to run |
| `tool_call_update` | the tool is running, finished or failed |
| `current_mode_update` | the mode changed |
| `config_option_update` | the model or effort changed |
| `usage_update` | context tokens and the running cost |
| `notice` | a live status line (only when the client asks for notices) |

### Permissions

Before a risky tool runs, XMINAL asks the client:

```json
{
  "method": "session/request_permission",
  "params": {
    "sessionId": "…",
    "toolCall": { "toolCallId": "…", "title": "Write index.html", "kind": "edit", "status": "pending" },
    "options": [
      { "optionId": "allow-once",  "name": "Allow once", "kind": "allow_once" },
      { "optionId": "allow-always", "name": "Allow this tool for the rest of the session", "kind": "allow_always" },
      { "optionId": "reject-once", "name": "Reject", "kind": "reject_once" },
      { "optionId": "reject-always", "name": "Reject this tool for the rest of the session", "kind": "reject_always" }
    ]
  }
}
```

The client answers with `{"outcome": {"outcome": "selected", "optionId": "allow-once"}}`
(or `{"outcome": {"outcome": "cancelled"}}`). "Always" is remembered for the life of
the session — never written to disk.

### Terminals

When the client advertises the `terminal` capability, shell commands run in the
**client's** terminal instead of XMINAL's own shell: the user sees the command in
their editor, and the output streams back into the tool card.

### MCP servers

The MCP servers the client lists in `session/new`, `session/load` or `session/resume`
are connected for that session and merged with the project's own MCP servers.

---

## Honesty notes

- XMINAL implements **ACP v1** (the stable protocol). The v2 draft is not implemented.
- `promptCapabilities` advertise `text` and `resource` blocks only — no images or audio.
- MCP over HTTP and SSE are **not** advertised; only the stdio transport is used.
- Every payload this agent sends was validated against the official
  `schema/v1/schema.json` of `agentclientprotocol/agent-client-protocol`, and the
  agent was driven end-to-end by the official `@agentclientprotocol/sdk` client.

## See also

- [`FRONTENDS.md`](FRONTENDS.md) — the terminal, the web UI and the Telegram bridge
- [`MCP.md`](MCP.md) — the other side of the story: tools for *your* agent
- [`SECURITY.md`](SECURITY.md) — the trust model behind the permission prompts
