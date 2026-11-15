#!/usr/bin/env node
/**
 * The XMINAL eval suite — every feature, one run each.
 *
 * Each task runs the real agent (`xminal run`) in a throwaway project and
 * checks an *observable* outcome: a file that must exist, a command that must
 * have run, a transcript that must mention a tool. Nothing is taken on the
 * agent's word.
 *
 *   node scripts/run-eval.cjs                     # the whole suite
 *   node scripts/run-eval.cjs --only write,todo   # a subset
 *   node scripts/run-eval.cjs --model groq/openai/gpt-oss-120b
 *   node scripts/run-eval.cjs --keep              # keep the scratch projects
 *
 * Writes eval-report.json next to the repo root.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const CLI = path.join(ROOT, "dist", "index.js");
const DEFAULT_MODEL = "groq/openai/gpt-oss-120b";

// ── helpers ─────────────────────────────────────────────────────────────────

const read = (file) => {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
};

/** Everything the agent said and did, from the session transcript. */
function transcript(dir, sessionId) {
  const file = path.join(dir, ".xminal", "sessions", sessionId ?? "", "events.jsonl");
  return read(file);
}

const mentions = (haystack, needle) => haystack.toLowerCase().includes(String(needle).toLowerCase());

const has = (dir, rel) => fs.existsSync(path.join(dir, rel));

function todos(dir) {
  try {
    const raw = JSON.parse(read(path.join(dir, ".xminal", "todos.json")));
    return Array.isArray(raw) ? raw : raw.items ?? [];
  } catch {
    return [];
  }
}

function memory(dir) {
  return read(path.join(dir, ".xminal", "memory", "entries.jsonl"));
}

function git(dir, ...args) {
  const out = spawnSync("git", args, { cwd: dir, encoding: "utf8" });
  return (out.stdout ?? "") + (out.stderr ?? "");
}

// ── the suite ───────────────────────────────────────────────────────────────

const TASKS = [
  {
    id: "write",
    cluster: "files",
    title: "write a file with exact content",
    prompt: "Create a file named greeting.txt containing exactly one line: hello-eval. Then stop.",
    check: (dir) => {
      const file = path.join(dir, "greeting.txt");
      if (!fs.existsSync(file)) return { ok: false, detail: "greeting.txt was never created" };
      const body = read(file);
      return body.includes("hello-eval")
        ? { ok: true, detail: "greeting.txt holds the requested line" }
        : { ok: false, detail: `greeting.txt does not hold the line (got ${JSON.stringify(body.slice(0, 60))})` };
    },
  },
  {
    id: "edit",
    cluster: "files",
    title: "edit one line of an existing file",
    setup: (dir) => {
      fs.writeFileSync(path.join(dir, "config.txt"), "alpha=1\nbeta=2\ngamma=3\n");
    },
    prompt: "In config.txt change the line that starts with beta so it reads beta=42. Leave every other line untouched.",
    check: (dir) => {
      const body = read(path.join(dir, "config.txt"));
      if (!body.includes("beta=42")) return { ok: false, detail: "the edit did not land" };
      if (!body.includes("alpha=1") || !body.includes("gamma=3")) {
        return { ok: false, detail: "the edit damaged the neighbouring lines" };
      }
      return { ok: true, detail: "only the beta line changed" };
    },
  },
  {
    id: "multi-edit",
    cluster: "files",
    title: "three separate edits in one turn",
    setup: (dir) => {
      fs.writeFileSync(path.join(dir, "app.js"), "const a = 1;\nconst b = 2;\nconst c = 3;\n");
    },
    prompt:
      "In app.js change const a = 1 to const a = 10, const b = 2 to const b = 20 and const c = 3 to const c = 30. Make all three changes.",
    check: (dir) => {
      const body = read(path.join(dir, "app.js"));
      const missing = ["a = 10", "b = 20", "c = 30"].filter((needle) => !body.includes(needle));
      return missing.length === 0
        ? { ok: true, detail: "all three constants updated" }
        : { ok: false, detail: `missing: ${missing.join(", ")}` };
    },
  },
  {
    id: "read",
    cluster: "files",
    title: "answer a question about a file",
    setup: (dir) => {
      fs.writeFileSync(path.join(dir, "invoice.txt"), "Invoice #4412\nTotal due: 318 USD\n");
    },
    prompt: "What is the total due on the invoice? Answer with the number and the currency.",
    check: (dir, ctx) =>
      mentions(ctx.text, "318") && mentions(ctx.text, "usd")
        ? { ok: true, detail: "the total and the currency were read out" }
        : { ok: false, detail: `the answer did not carry 318 USD (got ${JSON.stringify(ctx.text.slice(0, 90))})` },
  },
  {
    id: "grep",
    cluster: "search",
    title: "find a symbol with grep",
    setup: (dir) => {
      fs.mkdirSync(path.join(dir, "src"), { recursive: true });
      fs.writeFileSync(path.join(dir, "src", "a.js"), "export function alphaOne() { return 1; }\n");
      fs.writeFileSync(path.join(dir, "src", "b.js"), "export function betaTwo() { return 2; }\n");
    },
    prompt: "Which file defines the function named betaTwo? Give the file name and the line number.",
    check: (dir, ctx) =>
      mentions(ctx.text, "b.js") && (mentions(ctx.transcript, "grep") || mentions(ctx.transcript, "betaTwo"))
        ? { ok: true, detail: "found the definition" }
        : { ok: false, detail: `the answer did not name b.js (got ${JSON.stringify(ctx.text.slice(0, 90))})` },
  },
  {
    id: "glob",
    cluster: "search",
    title: "list files by pattern",
    setup: (dir) => {
      fs.mkdirSync(path.join(dir, "src", "deep"), { recursive: true });
      fs.writeFileSync(path.join(dir, "src", "one.ts"), "export const one = 1;\n");
      fs.writeFileSync(path.join(dir, "src", "deep", "two.ts"), "export const two = 2;\n");
      fs.writeFileSync(path.join(dir, "readme.md"), "# demo\n");
    },
    prompt: "List every TypeScript file in this project, using a file search. Reply with the paths only.",
    check: (dir, ctx) =>
      mentions(ctx.text, "one.ts") && mentions(ctx.text, "two.ts")
        ? { ok: true, detail: "both .ts files were listed" }
        : { ok: false, detail: `the list was incomplete (got ${JSON.stringify(ctx.text.slice(0, 120))})` },
  },
  {
    id: "bash",
    cluster: "shell",
    title: "run a shell command and use its output",
    setup: (dir) => {
      fs.writeFileSync(path.join(dir, "seed.txt"), "seeded\n");
    },
    prompt: "Run the shell command: printf 'shell-eval\\n' > result.txt — then confirm result.txt exists.",
    check: (dir, ctx) => {
      if (read(path.join(dir, "result.txt")).includes("shell-eval")) {
        return { ok: true, detail: "the command ran and wrote the file" };
      }
      return { ok: false, detail: "result.txt was never written" };
    },
  },
  {
    id: "bash-failure",
    cluster: "shell",
    title: "run a failing command and explain it",
    setup: (dir) => {
      fs.writeFileSync(path.join(dir, "broken.sh"), "#!/bin/sh\necho 'cannot open missing.db'\nexit 3\n");
    },
    prompt: "Run broken.sh and tell me what went wrong, including the exit code.",
    check: (dir, ctx) =>
      mentions(ctx.transcript, "broken.sh") && (mentions(ctx.text, "exit") || mentions(ctx.text, "3"))
        ? { ok: true, detail: "the failure was reported" }
        : { ok: false, detail: `the failure was not explained (got ${JSON.stringify(ctx.text.slice(0, 120))})` },
  },
  {
    id: "todo",
    cluster: "tasks",
    title: "track work with the todo list",
    prompt: "Add three todos: 'write the parser', 'write the tests', 'run the suite'. Keep them on the todo list.",
    check: (dir) => {
      const items = todos(dir);
      const text = JSON.stringify(items);
      const hits = ["parser", "tests", "suite"].filter((needle) => mentions(text, needle)).length;
      return hits >= 2 && items.length > 0
        ? { ok: true, detail: `${items.length} todo(s) recorded` }
        : { ok: false, detail: `the todo list holds ${items.length} item(s): ${text.slice(0, 120)}` };
    },
  },
  {
    id: "memory",
    cluster: "tasks",
    title: "remember a fact for the project",
    prompt: "Remember this for the project: the deploy key is rotated on the first Monday of every month.",
    check: (dir) => {
      const body = memory(dir);
      return mentions(body, "deploy key") || mentions(body, "first monday")
        ? { ok: true, detail: "the fact is in the project memory" }
        : { ok: false, detail: `memory holds: ${body.slice(0, 140)}` };
    },
  },
  {
    id: "git-commit",
    cluster: "git",
    title: "commit a change in a git project",
    setup: (dir) => {
      git(dir, "init", "-q");
      git(dir, "config", "user.email", "eval@xminal.local");
      git(dir, "config", "user.name", "XMINAL Eval");
      fs.writeFileSync(path.join(dir, "notes.md"), "# notes\n");
      git(dir, "add", ".");
      git(dir, "commit", "-q", "-m", "seed");
    },
    prompt: "Add a line 'ship it' at the end of notes.md and commit the change with a short message.",
    check: (dir) => {
      const log = git(dir, "log", "--oneline");
      const commits = log.trim().split("\n").filter(Boolean).length;
      if (!read(path.join(dir, "notes.md")).includes("ship it")) {
        return { ok: false, detail: "notes.md was not changed" };
      }
      return commits >= 2
        ? { ok: true, detail: `${commits} commits, the new one is there` }
        : { ok: false, detail: "no commit was created" };
    },
  },
  {
    id: "worktree",
    cluster: "git",
    title: "create a git worktree",
    setup: (dir) => {
      git(dir, "init", "-q");
      git(dir, "config", "user.email", "eval@xminal.local");
      git(dir, "config", "user.name", "XMINAL Eval");
      fs.writeFileSync(path.join(dir, "main.txt"), "main\n");
      git(dir, "add", ".");
      git(dir, "commit", "-q", "-m", "seed");
    },
    prompt: "Create a git worktree for a branch called feature/eval-worktree. Just create it.",
    check: (dir) => {
      const worktrees = git(dir, "worktree", "list");
      const branches = git(dir, "branch", "--list");
      return mentions(worktrees, "feature") || mentions(branches, "feature/eval-worktree")
        ? { ok: true, detail: "the worktree/branch exists" }
        : { ok: false, detail: `no worktree was created (${worktrees.trim().slice(0, 120)})` };
    },
  },
  {
    id: "verify-fix",
    cluster: "verify",
    title: "fix a failing test and make it pass",
    setup: (dir) => {
      fs.writeFileSync(path.join(dir, "sum.js"), "function sum(a, b) {\n  return a - b;\n}\nmodule.exports = { sum };\n");
      fs.writeFileSync(
        path.join(dir, "sum.test.js"),
        "const { sum } = require('./sum');\nconst assert = require('node:assert');\nassert.strictEqual(sum(2, 3), 5);\n",
      );
      fs.writeFileSync(
        path.join(dir, "package.json"),
        JSON.stringify({ name: "sum-fixture", version: "1.0.0", scripts: { test: "node sum.test.js" } }, null, 2),
      );
    },
    prompt: "The test fails. Run it, see why, fix the code so the test passes, then run the test again.",
    check: (dir) => {
      const out = spawnSync(process.execPath, ["sum.test.js"], { cwd: dir, encoding: "utf8" });
      return out.status === 0
        ? { ok: true, detail: "the test passes now" }
        : { ok: false, detail: `the test still fails: ${(out.stderr ?? "").slice(0, 120)}` };
    },
  },
  {
    id: "checkpoint",
    cluster: "verify",
    title: "checkpoint a change and undo it",
    setup: (dir) => {
      fs.writeFileSync(path.join(dir, "keep.txt"), "original\n");
    },
    prompt: "Change keep.txt so it says edited. Then undo that change with the checkpoint tool so the file says original again.",
    check: (dir) => {
      const body = read(path.join(dir, "keep.txt"));
      return body.includes("original")
        ? { ok: true, detail: "the change was rolled back" }
        : { ok: false, detail: `keep.txt now says ${JSON.stringify(body.slice(0, 40))}` };
    },
  },
  {
    id: "mcp",
    cluster: "mcp",
    title: "call a tool through an MCP server",
    setup: (dir) => {
      fs.mkdirSync(path.join(dir, ".xminal"), { recursive: true });
      fs.writeFileSync(path.join(dir, ".xminal", "config.json"), JSON.stringify({ mcpServers: { local: { command: [process.execPath, CLI, "mcp", "--serve"] } } }, null, 2));
      fs.writeFileSync(path.join(dir, "data.txt"), "mcp-visible\n");
    },
    prompt:
      "There is an MCP server named 'local' with tools. Use it to read the file data.txt through the MCP server (mcp_call), not with your own read tool. Tell me what it says.",
    check: (dir, ctx) =>
      mentions(ctx.transcript, "mcp_call") && mentions(ctx.text, "mcp-visible")
        ? { ok: true, detail: "the file was read through MCP" }
        : { ok: false, detail: `the MCP path was not used (transcript mentions mcp_call: ${mentions(ctx.transcript, "mcp_call")})` },
  },
  {
    id: "subagent",
    cluster: "agents",
    title: "delegate to a subagent",
    setup: (dir) => {
      fs.writeFileSync(path.join(dir, "numbers.txt"), "1\n2\n3\n4\n5\n");
    },
    prompt:
      "Use a subagent (the task tool) to count the lines in numbers.txt and report the count. Use the subagent, not your own read tool.",
    check: (dir, ctx) =>
      mentions(ctx.transcript, "subagent") || mentions(ctx.transcript, "task")
        ? { ok: true, detail: "a subagent was used" }
        : { ok: false, detail: "no subagent shows up in the transcript" },
  },
  {
    id: "plan-mode",
    cluster: "modes",
    title: "plan mode plans without touching files",
    flags: ["--mode", "plan"],
    setup: (dir) => {
      fs.writeFileSync(path.join(dir, "plan-me.txt"), "unchanged\n");
    },
    prompt: "We need to rename plan-me.txt to done.txt. Plan the change; do not make it yet.",
    check: (dir) => {
      const body = read(path.join(dir, "plan-me.txt"));
      const created = has(dir, "done.txt");
      return body.includes("unchanged") && !created
        ? { ok: true, detail: "nothing was changed in plan mode" }
        : { ok: false, detail: created ? "plan mode wrote a file" : "the seeded file was modified" };
    },
  },
  {
    id: "capabilities",
    cluster: "discovery",
    title: "discover its own capabilities",
    prompt: "Which tools do you have? List a few of them by name, using your capability discovery tool.",
    check: (dir, ctx) =>
      mentions(ctx.transcript, "capabilities") || mentions(ctx.text, "read") || mentions(ctx.text, "bash")
        ? { ok: true, detail: "the agent knows what it can do" }
        : { ok: false, detail: "no capability discovery happened" },
  },
  {
    id: "project",
    cluster: "everything",
    title: "build a small project with tests (the kitchen sink)",
    maxTurns: 24,
    setup: (dir) => {
      fs.mkdirSync(path.join(dir, "src"), { recursive: true });
      fs.writeFileSync(
        path.join(dir, "package.json"),
        JSON.stringify({ name: "slugify-fixture", version: "1.0.0", scripts: { test: "node test/run.js" } }, null, 2),
      );
      fs.mkdirSync(path.join(dir, "test"), { recursive: true });
    },
    prompt: [
      "Build a small project in this directory:",
      "1. create src/slugify.js exporting a function slugify(text) that lowercases the text, replaces every run of non-alphanumeric characters with a single dash, and trims leading and trailing dashes (use module.exports, this is CommonJS);",
      "2. create test/run.js that asserts slugify('Hello, World!') === 'hello-world' and slugify('  --A B--  ') === 'a-b', and exits non-zero when an assertion fails;",
      "3. create README.md with a one-line description, a usage example and the command that runs the tests;",
      "4. run the test with: npm test — and make sure it passes.",
      "Keep it dependency-free.",
    ].join(" "),
    check: (dir) => {
      const problems = [];
      if (!has(dir, "src/slugify.js")) problems.push("src/slugify.js is missing");
      if (!has(dir, "test/run.js")) problems.push("test/run.js is missing");
      if (!has(dir, "README.md")) problems.push("README.md is missing");
      if (!problems.length) {
        const out = spawnSync(process.execPath, ["test/run.js"], { cwd: dir, encoding: "utf8" });
        if (out.status !== 0) problems.push(`the test does not pass: ${(out.stderr ?? "").slice(0, 100)}`);
      }
      return problems.length === 0
        ? { ok: true, detail: "slugify, its test and the README are all there and the test passes" }
        : { ok: false, detail: problems.join("; ") };
    },
  },
];

// ── the runner ──────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    const name = arg.slice(2);
    if (["keep", "verbose", "quiet"].includes(name)) flags[name] = true;
    else flags[name] = argv[++i] ?? "";
  }
  return flags;
}

function runTask(task, options) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `xminal-eval-${task.id}-`));
  const started = Date.now();
  let result = { ok: false, detail: "the task never ran" };
  let json = {};
  let stderr = "";
  try {
    if (task.setup) task.setup(dir);
    const args = [
      CLI,
      "run",
      task.prompt,
      "--json",
      "--new",
      "--permission",
      "full",
      "--max-turns",
      String(task.maxTurns ?? 14),
      "--model",
      options.model,
      ...(task.flags ?? []),
    ];
    const out = spawnSync(process.execPath, args, {
      cwd: dir,
      encoding: "utf8",
      timeout: options.timeoutMs ?? 300_000,
      env: { ...process.env, XMINAL_MODELS_OFFLINE: "1", NO_COLOR: "1" },
    });
    stderr = out.stderr ?? "";
    const stdout = out.stdout ?? "";
    const start = stdout.indexOf("{");
    if (start >= 0) {
      try {
        json = JSON.parse(stdout.slice(start));
      } catch {
        json = {};
      }
    }
    const ctx = {
      text: json.text ?? "",
      json,
      transcript: transcript(dir, json.sessionId),
      stderr,
    };
    result = task.check(dir, ctx);
  } catch (error) {
    result = { ok: false, detail: `the task threw: ${error instanceof Error ? error.message : String(error)}` };
  }
  const record = {
    id: task.id,
    cluster: task.cluster,
    title: task.title,
    ok: Boolean(result.ok),
    detail: result.detail,
    seconds: Math.round((Date.now() - started) / 100) / 10,
    turns: json.turns ?? 0,
    costUsd: json.cost?.costUsd ?? 0,
    tokensIn: json.cost?.inputTokens ?? 0,
    tokensOut: json.cost?.outputTokens ?? 0,
    model: json.model ?? options.model,
    dir: options.keep ? dir : undefined,
  };
  if (!options.keep) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* the scratch dir stays — it is in tmp */
    }
  }
  return record;
}

function main() {
  const flags = parseArgs(process.argv.slice(2));
  const options = {
    model: flags.model || DEFAULT_MODEL,
    keep: Boolean(flags.keep),
    timeoutMs: flags.timeout ? Number(flags.timeout) * 1000 : 300_000,
  };
  const only = flags.only ? flags.only.split(",").map((id) => id.trim()) : null;
  const tasks = TASKS.filter((task) => !only || only.includes(task.id));
  if (!tasks.length) {
    console.error(`no task matches --only ${flags.only}`);
    process.exit(1);
  }

  console.log(`xminal eval · ${tasks.length} task(s) · model ${options.model}\n`);
  const records = [];
  for (const task of tasks) {
    process.stdout.write(`· ${task.id.padEnd(12)} ${task.title.slice(0, 58).padEnd(60)}`);
    const record = runTask(task, options);
    records.push(record);
    console.log(`${record.ok ? "PASS" : "FAIL"}  ${record.seconds}s  ${record.turns} turns  $${Number(record.costUsd).toFixed(4)}`);
    if (!record.ok) console.log(`             ↳ ${record.detail}`);
  }

  const passed = records.filter((record) => record.ok).length;
  const cost = records.reduce((sum, record) => sum + Number(record.costUsd || 0), 0);
  const tokens = records.reduce((sum, record) => sum + Number(record.tokensIn || 0) + Number(record.tokensOut || 0), 0);
  const seconds = records.reduce((sum, record) => sum + record.seconds, 0);

  const byCluster = new Map();
  for (const record of records) {
    const bucket = byCluster.get(record.cluster) ?? { pass: 0, total: 0 };
    bucket.total += 1;
    if (record.ok) bucket.pass += 1;
    byCluster.set(record.cluster, bucket);
  }

  console.log(`\n${passed}/${records.length} passed · ${Math.round(seconds)}s · ${tokens} tokens · $${cost.toFixed(4)}`);
  console.log(
    [...byCluster.entries()]
      .map(([cluster, bucket]) => `${cluster} ${bucket.pass}/${bucket.total}`)
      .join(" · "),
  );

  const report = {
    model: options.model,
    when: new Date().toISOString(),
    passed,
    total: records.length,
    costUsd: cost,
    seconds: Math.round(seconds),
    tasks: records,
  };
  const outFile = path.join(ROOT, "eval-report.json");
  fs.writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\nreport → ${outFile}`);
  process.exitCode = passed === records.length ? 0 : 1;
}

main();
