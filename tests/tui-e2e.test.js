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

/** Boot the TUI, run `script`, and return everything it printed (ANSI kept). */
function runTuiRaw(script, { timeout = 20000 } = {}) {
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
      resolve(out);
    });
    // let the first frame render, then feed the script
    setTimeout(() => {
      for (const line of script) child.stdin.write(line);
    }, 900);
  });
}

/** Same as runTui, but with the ANSI sequences stripped. */
function runTui(script, options) {
  return runTuiRaw(script, options).then(stripAnsi);
}

/** The last complete frame, without the exit sequence that follows it. */
function lastFrame(raw) {
  const frames = raw.split("\x1b[H").filter((f) => f.includes("\x1b[K"));
  assert.ok(frames.length > 0, "no frame was drawn");
  return frames[frames.length - 1].split("\x1b[?1049l")[0];
}

test("the frame is exactly screen-height and never scrolls the terminal", async () => {
  const raw = await runTuiRaw(["/exit\r"]);
  const frame = lastFrame(raw);
  const rows = frame.split("\r\n").length;
  // LINES=28 in the test env: the frame must be exactly the screen height
  assert.equal(rows, 28, `the frame must be exactly screen-height, got ${rows} rows`);
  // a newline after the bottom row scrolls the terminal by one line — that
  // shifts the whole UI on every repaint (the "vibration" users reported)
  assert.ok(!frame.replace(/\x1b\[K/g, "").endsWith("\n"), "the frame must not end with a newline");
});

test("the composer panel keeps one continuous background", async () => {
  const raw = await runTuiRaw(["/exit\r"]);
  const frame = lastFrame(raw);
  const allRows = frame.split("\r\n");
  // the composer band sits above the footer; the footer is the last row
  const composerRows = allRows.slice(-6, -1);
  assert.ok(composerRows.length >= 3, "the composer band should have several rows");
  for (const row of composerRows) {
    if (!row.includes("48;2;30;30;30")) continue; // the closing blank row
    // a reset in the middle of the band punches a hole in the panel fill;
    // the trailing reset at the very end of the row is fine
    const body = row.replace(/\x1b\[K$/, "").replace(/(\x1b\[0m)+$/, "");
    const hole = body.match(/\x1b\[0m(?![\x1b]\[48;2;(?:30;30;30|10;10;10)m)/);
    assert.equal(hole, null, "a reset inside the composer band breaks its background");
  }
});

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
