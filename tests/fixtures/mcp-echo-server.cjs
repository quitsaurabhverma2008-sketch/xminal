const readline = require("node:readline");

const tools = [
  {
    name: "echo",
    description: "Echo the provided text back.",
    inputSchema: {
      type: "object",
      properties: { text: { type: "string" } },
      required: ["text"],
    },
  },
];

function write(message) {
  process.stdout.write(JSON.stringify(message) + "\n");
}

readline.createInterface({ input: process.stdin, terminal: false }).on("line", (line) => {
  if (!line.trim()) return;
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return;
  }
  const id = message.id;
  if (message.method === "initialize") {
    write({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "xminal-test-mcp", version: "0.0.1" },
      },
    });
    return;
  }
  if (message.method === "notifications/initialized") return;
  if (message.method === "tools/list") {
    write({ jsonrpc: "2.0", id, result: { tools } });
    return;
  }
  if (message.method === "tools/call") {
    const text = message?.params?.arguments?.text ?? "";
    write({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text }] } });
    return;
  }
  write({ jsonrpc: "2.0", id, error: { code: -32601, message: "method not found" } });
});
