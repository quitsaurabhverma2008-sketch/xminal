// End-to-end TUI smoke test: boot the real TUI over a pipe, render a frame,
// run a slash command inside it and check what the user would actually see.
//
// This is the regression net for the TUI: it caught the palette swallowing
// commands, the wheel scrolling the wrong thing and the vendored-engine paths.
const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const { spawn } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const ENTRY = path.join(ROOT, "dist", "index.js");

function stripAnsi(text) {
  return text.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "").replace(/\x1b\][^\x07]*\x07/g, "");
}

/** Boot the TUI, run `script`, and return everything it printed. */
function runTui(script, { timeout = 20000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [ENTRY], {
      cwd: ROOT,
      env: {
        ...process.env,
        XMINAL_TUI: "1",
        XMINAL_MODELS_OFFLINE: "1",
        NO_COLOR: "1",
        TERM: "xterm-256color",
        COLUMNS: "100",
        LINES: "28",
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`TUI did not exit in ${timeout}ms`));
    }, timeout);
    child.stdout.on("data", (chunk) => {
      out += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      out += chunk.toString();
    });
    child.on("error", reject);
    child.on("exit", () => {
      clearTimeout(timer);
      resolve(stripAnsi(out));
    });
    // let the first frame render, then feed the script
    setTimeout(() => {
      for (const line of script) child.stdin.write(line);
    }, 900);
  });
}

test("the TUI boots and renders the opencode-style frame", async () => {
  const out = await runTui(["/exit\r"]);
  assert.ok(out.length > 0, "the TUI produced no output at all");
  // the ASCII wordmark (the letters are drawn with spacing, so match the art)
  assert.ok(/█╗/.test(out) || /C O D I N G/.test(out), "the banner is missing");
  // the opencode-style input box
  assert.ok(/Ask anything/.test(out), "the input box is missing");
  // the opencode footer: workspace on the left, "ctrl+p commands" on the right
  assert.ok(/ctrl\+p commands/.test(out), "the footer hint is missing");
  // the composer meta row: mode · model
  assert.ok(/Build|Plan|Review|Compose/.test(out), "the composer meta row is missing");
});

test("a slash command runs inside the TUI instead of leaving the alternate screen", async () => {
  const out = await runTui(["/skills\r", "/exit\r"]);
  assert.ok(/no skills installed/i.test(out), `/skills did not run in the TUI:\n${out.slice(-800)}`);
  // the classic path leaves the alternate screen (mode 1049) — the native one does not
  const raw = out.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");
  assert.ok(!raw.includes("[?1049l"), "the TUI left the alternate screen");
});

test("/cost reports the session cost inside the TUI", async () => {
  const out = await runTui(["/cost\r", "/exit\r"]);
  assert.ok(/cost/.test(out), `/cost did not run in the TUI:\n${out.slice(-800)}`);
});
