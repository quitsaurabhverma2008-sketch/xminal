// Render the REAL page script (no browser) with @napi-rs/canvas → PNG frames.
// The page's CSS body gradient is painted behind the canvas each frame so the
// capture looks exactly like the browser rendering.
import fs from "node:fs";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";

// register a real font family (the sandbox has no usable 'sans-serif' alias)
GlobalFonts.registerFromPath("/data/data/com.termux/files/home/.fonts/FiraCode_bold.ttf", "DemoSans");
GlobalFonts.registerFromPath("/data/data/com.termux/files/home/.fonts/FiraCode.ttf", "DemoSans");

const htmlPath = process.argv[2];
const W = Number(process.argv[3] || 900);
const H = Number(process.argv[4] || 500);
const OUT = process.argv[5] || "/data/data/com.termux/files/usr/tmp/opencode/page-frames";

const html = fs.readFileSync(htmlPath, "utf8");
let script = html.split("<script>")[1].split("</script>")[0];

// inject the page background in place of the clear
script = script.replace(
  "ctx.clearRect(0, 0, canvas.width, canvas.height);",
  "ctx.fillStyle = __bg(); ctx.fillRect(0, 0, canvas.width, canvas.height);",
);
// use the registered family instead of the unresolvable 'sans-serif'
script = script.replace(/px sans-serif/g, "px DemoSans");

const listeners = new Map();
const on = (t, fn) => {
  if (!listeners.has(t)) listeners.set(t, []);
  listeners.get(t).push(fn);
};
const makeEl = (w, h) => {
  const c = createCanvas(w, h);
  const el = {
    clientWidth: w,
    clientHeight: h,
    style: {},
    _canvas: c,
    getContext: () => c.getContext("2d"),
    addEventListener: on,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: el.clientWidth, height: el.clientHeight }),
  };
  // element.width/height must resize the real backing store
  let cw = w, ch = h;
  Object.defineProperty(el, "width", {
    get: () => cw,
    set: (v) => { cw = v; c.width = v; },
  });
  Object.defineProperty(el, "height", {
    get: () => ch,
    set: (v) => { ch = v; c.height = v; },
  });
  return el;
};

const main = makeEl(W, H);
globalThis.document = {
  getElementById: (id) => (id === "canvas" ? main : null),
  createElement: () => makeEl(W, H),
  body: { appendChild() {}, style: {} },
};
globalThis.window = {
  devicePixelRatio: 2,
  addEventListener: on,
  innerWidth: W,
  innerHeight: H,
};
let rafQueue = [];
globalThis.requestAnimationFrame = (fn) => rafQueue.push(fn);
globalThis.performance = { now: () => Date.now() };
globalThis.__bg = () => {
  const g = main._canvas.getContext("2d");
  const grad = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) / 2);
  grad.addColorStop(0, "#0a0c2a");
  grad.addColorStop(1, "#02030a");
  return grad;
};

new Function(script)();

fs.mkdirSync(OUT, { recursive: true });
const step = (n) => {
  for (let i = 0; i < n; i++) {
    const q = rafQueue;
    rafQueue = [];
    for (const fn of q) fn(Date.now());
  }
};
const save = (name) => fs.writeFileSync(`${OUT}/${name}`, main._canvas.toBuffer("image/png"));
const click = () => (listeners.get("click") || []).forEach((fn) => fn({}));

step(2); save("f00.png");
step(8); save("f01.png");
click();
step(6); save("f02.png");
step(8); save("f03.png");
step(10); save("f04.png");
step(14); save("f05.png");
click();
step(8); save("f06.png");
step(12); save("f07.png");
step(18); save("f08.png");
step(26); save("f09.png");
step(34); save("f10.png");
console.log("frames →", OUT);
