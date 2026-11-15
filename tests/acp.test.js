// Agent Client Protocol (ACP) tests — fully offline.
//
// A fake OpenAI-compatible server stands in for the model, so the whole
// session/prompt → tool call → permission → result path runs without a
// network call or an API key.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { PassThrough } = require("node:stream");
const { spawn } = require("node:child_process");

const { AcpAgent } = require("../dist/acp/server");
const { parseArgs, KNOWN_COMMANDS } = require("../dist/cli/args");

delete process.env.XMINAL_PERMISSION_MODE;
delete process.env.XMINAL_MODEL;

/** A fake OpenAI-compatible endpoint that replays canned SSE chunks. */
function fakeProvider(respond) {
  const state = { calls: 0 };
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      let parsed = {};
      try {
        parsed = JSON.parse(body || "{}");
      } catch {
        parsed = {};
      }
      const chunks = respond(parsed, state.calls++);
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
      for (const chunk of chunks) res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      resolve({
        port,
        baseUrl: `http://127.0.0.1:${port}/v1`,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

function textChunk(text) {
  return { choices: [{ delta: { content: text }, index: 0 }] };
}

function toolChunk(id, name, args) {
  return {
    choices: [
      {
        delta: {
          tool_calls: [{ index: 0, id, type: "function", function: { name, arguments: JSON.stringify(args) } }],
        },
        index: 0,
      },
    ],
  };
}

/** A project with a fake provider wired in. */
async function project({ permissionMode = "ask" } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "xminal-acp-"));
  const provider = await fakeProvider(() => [textChunk("ok")]);
  const config = {
    version: 1,
    providers: {
      fake: { type: "openai", baseUrl: provider.baseUrl, apiKey: "test-key" },
    },
    models: {
      "fake/model": { provider: "fake", model: "fake-model", contextWindow: 8000, maxOutput: 2000 },
    },
    defaultModel: "fake/model",
    autoVerify: false,
    autoVerifyRepairs: 0,
    permissions: { mode: permissionMode },
  };
  fs.mkdirSync(path.join(dir, ".xminal"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".xminal", "config.json"), JSON.stringify(config, null, 2));
  return {
    dir,
    provider,
    cleanup: async () => {
      await provider.close();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

/**
 * A minimal ACP client: it speaks the protocol to an AcpAgent over pipes and
 * records every message so the test can assert on the stream.
 */
function client(agentOptions) {
  const input = new PassThrough();
  const output = new PassThrough();
  const agent = new AcpAgent({ ...agentOptions, input, output });
  const messages = [];
  const pending = new Map();
  let nextId = 1;

  output.on("data", (chunk) => {
    for (const line of chunk.toString("utf8").split("\n")) {
      if (!line.trim()) continue;
      const message = JSON.parse(line);
      messages.push(message);
      const waiter = pending.get(message.id);
      if (waiter) {
        pending.delete(message.id);
        waiter(message);
      }
    }
  });

  agent.start();

  const request = (method, params) =>
    new Promise((resolve) => {
      const id = nextId++;
      pending.set(id, resolve);
      input.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    });

  const notify = (method, params) => {
    input.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
  };

  const raw = (line) => {
    input.write(`${line}\n`);
  };

  /** Answer a request the agent sent to us (permission, terminal, fs). */
  const answer = (id, result) => {
    input.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
  };

  const updates = (sessionId) =>
    messages
      .filter((message) => message.method === "session/update")
      .filter((message) => !sessionId || message.params.sessionId === sessionId)
      .map((message) => message.params.update);

  const clientRequests = () =>
    messages.filter((message) => message.method && message.id !== undefined);

  return { agent, input, output, messages, request, notify, raw, answer, updates, clientRequests };
}

test("initialize negotiates protocol v1 and advertises the agent", async () => {
  const scope = await project();
  try {
    const acp = client({ cwd: scope.dir });
    const response = await acp.request("initialize", {
      protocolVersion: 1,
      clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, terminal: true },
      clientInfo: { name: "test-client", version: "1.0.0" },
    });
    assert.equal(response.result.protocolVersion, 1);
    assert.equal(response.result.agentCapabilities.loadSession, true);
    assert.equal(response.result.agentInfo.name, "xminal");
    assert.equal(response.result.agentInfo.version, require("../dist/version").VERSION);
    assert.deepEqual(response.result.authMethods, []);
    assert.ok(response.result.agentCapabilities.sessionCapabilities.resume);
    assert.ok(response.result.agentCapabilities.sessionCapabilities.delete);
    acp.agent.close();
  } finally {
    await scope.cleanup();
  }
});

test("session/new returns a session id with modes and model options", async () => {
  const scope = await project();
  try {
    const acp = client({ cwd: scope.dir });
    await acp.request("initialize", { protocolVersion: 1, clientCapabilities: {} });
    const response = await acp.request("session/new", { cwd: scope.dir, mcpServers: [] });
    assert.ok(response.result.sessionId);
    assert.equal(response.result.modes.currentModeId, "build");
    assert.ok(response.result.modes.availableModes.some((mode) => mode.id === "plan"));
    const model = response.result.configOptions.find((option) => option.id === "model");
    assert.ok(model, "the model picker is advertised");
    assert.equal(model.type, "select");
    assert.equal(model.currentValue, "fake/model");
    assert.ok(model.options.some((option) => option.value === "fake/model"));
    acp.agent.close();
  } finally {
    await scope.cleanup();
  }
});

test("an unknown method answers with -32601", async () => {
  const scope = await project();
  try {
    const acp = client({ cwd: scope.dir });
    const response = await acp.request("session/nope", {});
    assert.equal(response.error.code, -32601);
    acp.agent.close();
  } finally {
    await scope.cleanup();
  }
});

test("a malformed line answers with a parse error and the agent keeps going", async () => {
  const scope = await project();
  try {
    const acp = client({ cwd: scope.dir });
    acp.raw("{not json");
    await new Promise((resolve) => setTimeout(resolve, 60));
    const parseError = acp.messages.find((message) => message.error && message.error.code === -32700);
    assert.ok(parseError, "the parse error is reported");
    const response = await acp.request("initialize", { protocolVersion: 1, clientCapabilities: {} });
    assert.equal(response.result.protocolVersion, 1, "the connection still works");
    acp.agent.close();
  } finally {
    await scope.cleanup();
  }
});

test("an empty prompt is rejected and an unknown session is -32002", async () => {
  const scope = await project();
  try {
    const acp = client({ cwd: scope.dir });
    await acp.request("initialize", { protocolVersion: 1, clientCapabilities: {} });
    const created = await acp.request("session/new", { cwd: scope.dir, mcpServers: [] });
    const empty = await acp.request("session/prompt", { sessionId: created.result.sessionId, prompt: [] });
    assert.equal(empty.error.code, -32602);
    const unknown = await acp.request("session/prompt", { sessionId: "nope", prompt: [{ type: "text", text: "hi" }] });
    assert.equal(unknown.error.code, -32002);
    acp.agent.close();
  } finally {
    await scope.cleanup();
  }
});

test("session/set_mode switches the mode and tells the client", async () => {
  const scope = await project();
  try {
    const acp = client({ cwd: scope.dir });
    await acp.request("initialize", { protocolVersion: 1, clientCapabilities: {} });
    const created = await acp.request("session/new", { cwd: scope.dir, mcpServers: [] });
    const sessionId = created.result.sessionId;
    const response = await acp.request("session/set_mode", { sessionId, modeId: "plan" });
    assert.deepEqual(response.result, {});
    const update = acp.updates(sessionId).find((item) => item.sessionUpdate === "current_mode_update");
    assert.ok(update, "the client is told about the new mode");
    assert.equal(update.currentModeId, "plan");
    const bad = await acp.request("session/set_mode", { sessionId, modeId: "nonsense" });
    assert.equal(bad.error.code, -32602);
    acp.agent.close();
  } finally {
    await scope.cleanup();
  }
});

test("session/set_config_option switches the model", async () => {
  const scope = await project();
  try {
    const acp = client({ cwd: scope.dir });
    await acp.request("initialize", { protocolVersion: 1, clientCapabilities: {} });
    const created = await acp.request("session/new", { cwd: scope.dir, mcpServers: [] });
    const sessionId = created.result.sessionId;
    const response = await acp.request("session/set_config_option", {
      sessionId,
      configId: "model",
      value: { value: "fake/model" },
    });
    assert.ok(response.result.configOptions.some((option) => option.id === "model"));
    const bad = await acp.request("session/set_config_option", {
      sessionId,
      configId: "effort",
      value: { value: "insane" },
    });
    assert.equal(bad.error.code, -32602);
    acp.agent.close();
  } finally {
    await scope.cleanup();
  }
});

test("session/list reports the session and session/delete removes it", async () => {
  const scope = await project();
  try {
    const acp = client({ cwd: scope.dir });
    await acp.request("initialize", { protocolVersion: 1, clientCapabilities: {} });
    const created = await acp.request("session/new", { cwd: scope.dir, mcpServers: [] });
    const sessionId = created.result.sessionId;
    const listed = await acp.request("session/list", { cwd: scope.dir });
    assert.ok(listed.result.sessions.some((session) => session.sessionId === sessionId));
    const removed = await acp.request("session/delete", { sessionId });
    assert.deepEqual(removed.result, {});
    const after = await acp.request("session/list", { cwd: scope.dir });
    assert.equal(after.result.sessions.some((session) => session.sessionId === sessionId), false);
    acp.agent.close();
  } finally {
    await scope.cleanup();
  }
});

test("session/load replays the conversation to the client", async () => {
  const scope = await project();
  try {
    const acp = client({ cwd: scope.dir });
    await acp.request("initialize", { protocolVersion: 1, clientCapabilities: {} });
    const created = await acp.request("session/new", { cwd: scope.dir, mcpServers: [] });
    const sessionId = created.result.sessionId;
    acp.agent.close();

    // write a transcript, then load the session in a fresh connection
    const { Session } = require("../dist/core/session");
    const session = Session.load(scope.dir, sessionId);
    session.addMessage({ role: "user", content: "remember this" });
    session.addMessage({ role: "assistant", content: "noted" });

    const reloaded = client({ cwd: scope.dir });
    await reloaded.request("initialize", { protocolVersion: 1, clientCapabilities: {} });
    const loaded = await reloaded.request("session/load", { sessionId, cwd: scope.dir, mcpServers: [] });
    assert.ok(loaded.result.sessionId === undefined || loaded.result.sessionId === sessionId);
    const replay = reloaded.updates(sessionId);
    assert.ok(replay.some((item) => item.sessionUpdate === "user_message_chunk"));
    assert.ok(replay.some((item) => item.sessionUpdate === "agent_message_chunk"));
    reloaded.agent.close();
  } finally {
    await scope.cleanup();
  }
});

test("a prompt turn streams the answer and ends with end_turn", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "xminal-acp-turn-"));
  const provider = await fakeProvider(() => [textChunk("Hello from the fake model")]);
  const config = {
    version: 1,
    providers: { fake: { type: "openai", baseUrl: provider.baseUrl, apiKey: "test-key" } },
    models: { "fake/model": { provider: "fake", model: "fake-model", contextWindow: 8000 } },
    defaultModel: "fake/model",
    autoVerify: false,
    autoVerifyRepairs: 0,
    permissions: { mode: "ask" },
  };
  fs.mkdirSync(path.join(dir, ".xminal"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".xminal", "config.json"), JSON.stringify(config, null, 2));
  try {
    const acp = client({ cwd: dir });
    await acp.request("initialize", { protocolVersion: 1, clientCapabilities: {} });
    const created = await acp.request("session/new", { cwd: dir, mcpServers: [] });
    const sessionId = created.result.sessionId;
    const prompt = await acp.request("session/prompt", {
      sessionId,
      prompt: [{ type: "text", text: "say hello" }],
    });
    assert.equal(prompt.result.stopReason, "end_turn");
    const chunks = acp.updates(sessionId).filter((item) => item.sessionUpdate === "agent_message_chunk");
    assert.ok(chunks.length > 0, "the answer is streamed");
    assert.match(chunks.map((item) => item.content.text).join(""), /Hello from the fake model/);
    acp.agent.close();
  } finally {
    await provider.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a tool call asks the client for permission and runs once approved", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "xminal-acp-tool-"));
  const provider = await fakeProvider((_body, call) => {
    if (call === 0) return [toolChunk("call_1", "write", { path: "hello.txt", content: "written by the agent" })];
    return [textChunk("file written")];
  });
  const config = {
    version: 1,
    providers: { fake: { type: "openai", baseUrl: provider.baseUrl, apiKey: "test-key" } },
    models: { "fake/model": { provider: "fake", model: "fake-model", contextWindow: 8000 } },
    defaultModel: "fake/model",
    autoVerify: false,
    autoVerifyRepairs: 0,
    permissions: { mode: "ask" },
  };
  fs.mkdirSync(path.join(dir, ".xminal"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".xminal", "config.json"), JSON.stringify(config, null, 2));
  try {
    const acp = client({ cwd: dir });
    await acp.request("initialize", { protocolVersion: 1, clientCapabilities: {} });
    const created = await acp.request("session/new", { cwd: dir, mcpServers: [] });
    const sessionId = created.result.sessionId;

    const prompt = acp.request("session/prompt", {
      sessionId,
      prompt: [{ type: "text", text: "write a file" }],
    });

    // the agent must ask before it touches the file
    const ask = await new Promise((resolve) => {
      const timer = setInterval(() => {
        const found = acp.clientRequests().find((message) => message.method === "session/request_permission");
        if (found) {
          clearInterval(timer);
          resolve(found);
        }
      }, 20);
      setTimeout(() => {
        clearInterval(timer);
        resolve(undefined);
      }, 15000);
    });
    assert.ok(ask, "the client is asked for permission");
    assert.equal(ask.params.sessionId, sessionId);
    assert.ok(ask.params.options.some((option) => option.kind === "allow_once"));
    assert.ok(ask.params.options.some((option) => option.kind === "reject_once"));

    acp.answer(ask.id, { outcome: { outcome: "selected", optionId: "allow-once" } });

    const response = await prompt;
    assert.equal(response.result.stopReason, "end_turn");
    assert.equal(fs.readFileSync(path.join(dir, "hello.txt"), "utf8"), "written by the agent");

    const updates = acp.updates(sessionId);
    const call = updates.find((item) => item.sessionUpdate === "tool_call");
    assert.ok(call, "the tool call is reported");
    assert.equal(call.toolCallId, "call_1");
    assert.equal(call.name, "write");
    assert.equal(call.kind, "edit");
    const done = updates.find((item) => item.sessionUpdate === "tool_call_update" && item.status === "completed");
    assert.ok(done, "the tool call completes");
    const diff = (done.content || []).find((item) => item.type === "diff");
    assert.ok(diff, "the client gets a diff");
    assert.equal(diff.newText, "written by the agent");
    acp.agent.close();
  } finally {
    await provider.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a denied permission stops the tool", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "xminal-acp-deny-"));
  const provider = await fakeProvider((_body, call) => {
    if (call === 0) return [toolChunk("call_1", "write", { path: "nope.txt", content: "should not exist" })];
    return [textChunk("understood")];
  });
  const config = {
    version: 1,
    providers: { fake: { type: "openai", baseUrl: provider.baseUrl, apiKey: "test-key" } },
    models: { "fake/model": { provider: "fake", model: "fake-model", contextWindow: 8000 } },
    defaultModel: "fake/model",
    autoVerify: false,
    autoVerifyRepairs: 0,
    permissions: { mode: "ask" },
  };
  fs.mkdirSync(path.join(dir, ".xminal"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".xminal", "config.json"), JSON.stringify(config, null, 2));
  try {
    const acp = client({ cwd: dir });
    await acp.request("initialize", { protocolVersion: 1, clientCapabilities: {} });
    const created = await acp.request("session/new", { cwd: dir, mcpServers: [] });
    const sessionId = created.result.sessionId;
    const prompt = acp.request("session/prompt", { sessionId, prompt: [{ type: "text", text: "write a file" }] });
    const ask = await new Promise((resolve) => {
      const timer = setInterval(() => {
        const found = acp.clientRequests().find((message) => message.method === "session/request_permission");
        if (found) {
          clearInterval(timer);
          resolve(found);
        }
      }, 20);
      setTimeout(() => {
        clearInterval(timer);
        resolve(undefined);
      }, 15000);
    });
    assert.ok(ask);
    acp.answer(ask.id, { outcome: { outcome: "selected", optionId: "reject-once" } });
    await prompt;
    assert.equal(fs.existsSync(path.join(dir, "nope.txt")), false, "the file was never written");
    acp.agent.close();
  } finally {
    await provider.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("the acp command is routed, not treated as a prompt", () => {
  assert.ok(KNOWN_COMMANDS.has("acp"), "acp is a known command");
  const args = parseArgs(["acp"]);
  assert.equal(args.command, "acp");
});

test("`xminal acp` speaks JSON-RPC on stdout", async () => {
  const child = spawn(process.execPath, [path.join(__dirname, "..", "dist", "index.js"), "acp"], {
    cwd: os.tmpdir(),
    stdio: ["pipe", "pipe", "pipe"],
  });
  try {
    const lines = [];
    let buffer = "";
    child.stdout.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      let index = buffer.indexOf("\n");
      while (index !== -1) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        if (line) lines.push(JSON.parse(line));
        index = buffer.indexOf("\n");
      }
    });
    child.stdin.write(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: 0,
        method: "initialize",
        params: { protocolVersion: 1, clientCapabilities: {} },
      })}\n`,
    );
    const response = await new Promise((resolve) => {
      const timer = setInterval(() => {
        const found = lines.find((line) => line.id === 0);
        if (found) {
          clearInterval(timer);
          resolve(found);
        }
      }, 30);
      setTimeout(() => {
        clearInterval(timer);
        resolve(undefined);
      }, 15000);
    });
    assert.ok(response, "the agent answered on stdout");
    assert.equal(response.result.protocolVersion, 1);
    assert.equal(response.result.agentInfo.name, "xminal");
  } finally {
    child.kill("SIGTERM");
  }
});

test("the wire shapes match the official ACP v1 schema", async () => {
  // The official schema (agentclientprotocol/agent-client-protocol,
  // schema/v1/schema.json) was used to validate every payload this agent
  // sends. These are the shapes it caught us getting wrong:
  //   - a select option is { value, name } — NOT { id, name }
  //   - session/update may only use the schema's update variants
  //   - a permission request is { sessionId, toolCall, options }
  const scope = await project();
  try {
    const acp = client({ cwd: scope.dir });
    await acp.request("initialize", { protocolVersion: 1, clientCapabilities: {} });
    const created = await acp.request("session/new", { cwd: scope.dir, mcpServers: [] });
    const sessionId = created.result.sessionId;

    const options = created.result.configOptions;
    for (const option of options) {
      assert.equal(option.type, "select");
      assert.ok(typeof option.currentValue === "string");
      for (const choice of option.options) {
        assert.equal(typeof choice.value, "string", "a select option carries a `value` id");
        assert.equal(typeof choice.name, "string");
        assert.equal(choice.id, undefined, "the schema has no `id` on a select option");
      }
    }

    // the update variants the agent may send
    const allowed = new Set([
      "user_message_chunk",
      "agent_message_chunk",
      "agent_thought_chunk",
      "tool_call",
      "tool_call_update",
      "plan",
      "available_commands_update",
      "current_mode_update",
      "config_option_update",
      "session_info_update",
      "usage_update",
      "notice",
    ]);
    await acp.request("session/set_mode", { sessionId, modeId: "plan" });
    await acp.request("session/set_config_option", { sessionId, configId: "model", value: { value: "fake/model" } });
    for (const update of acp.updates(sessionId)) {
      assert.ok(allowed.has(update.sessionUpdate), `unknown session update: ${update.sessionUpdate}`);
    }
    acp.agent.close();
  } finally {
    await scope.cleanup();
  }
});

test("the permission request carries the shape the schema requires", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "xminal-acp-perm-"));
  const provider = await fakeProvider((_body, call) => {
    if (call === 0) return [toolChunk("call_9", "write", { path: "x.txt", content: "x" })];
    return [textChunk("done")];
  });
  const config = {
    version: 1,
    providers: { fake: { type: "openai", baseUrl: provider.baseUrl, apiKey: "test-key" } },
    models: { "fake/model": { provider: "fake", model: "fake-model", contextWindow: 8000 } },
    defaultModel: "fake/model",
    autoVerify: false,
    autoVerifyRepairs: 0,
    permissions: { mode: "ask" },
  };
  fs.mkdirSync(path.join(dir, ".xminal"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".xminal", "config.json"), JSON.stringify(config, null, 2));
  try {
    const acp = client({ cwd: dir });
    await acp.request("initialize", { protocolVersion: 1, clientCapabilities: {} });
    const created = await acp.request("session/new", { cwd: dir, mcpServers: [] });
    const sessionId = created.result.sessionId;
    const prompt = acp.request("session/prompt", { sessionId, prompt: [{ type: "text", text: "write" }] });
    const ask = await new Promise((resolve) => {
      const timer = setInterval(() => {
        const found = acp.clientRequests().find((message) => message.method === "session/request_permission");
        if (found) {
          clearInterval(timer);
          resolve(found);
        }
      }, 20);
      setTimeout(() => {
        clearInterval(timer);
        resolve(undefined);
      }, 15000);
    });
    assert.ok(ask);
    const params = ask.params;
    assert.equal(typeof params.sessionId, "string");
    assert.equal(typeof params.toolCall.toolCallId, "string");
    assert.equal(typeof params.toolCall.title, "string");
    assert.equal(typeof params.toolCall.kind, "string");
    assert.ok(Array.isArray(params.options) && params.options.length >= 2);
    for (const option of params.options) {
      assert.equal(typeof option.optionId, "string");
      assert.equal(typeof option.name, "string");
      assert.ok(["allow_once", "allow_always", "reject_once", "reject_always"].includes(option.kind));
    }
    acp.answer(ask.id, { outcome: { outcome: "selected", optionId: "allow-once" } });
    await prompt;
    acp.agent.close();
  } finally {
    await provider.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
