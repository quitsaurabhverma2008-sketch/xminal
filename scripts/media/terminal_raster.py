#!/usr/bin/env python3
"""ANSI terminal → PNG/GIF rasterizer (for XMINAL demo captures).

Usage:
  python3 terminal_raster.py --input capture.bin --out-dir frames/ --cell 15x18 --fps 3
  python3 terminal_raster.py --input capture.bin --png frame.png          # single shot
"""
import argparse, re, sys
from PIL import Image, ImageDraw, ImageFont

FONT_MONO = "/data/data/com.termux/files/home/.fonts/FiraCode.ttf"
FONT_MONO_BOLD = "/data/data/com.termux/files/home/.fonts/FiraCode_bold.ttf"

PALETTE = {
    0: "#000000", 7: "#c0c0c0", 15: "#ffffff",
    22: "#005f00", 46: "#00ff00", 82: "#5fff5f", 196: "#ff0000",
    203: "#ff8787", 208: "#ff8700", 228: "#ffff87",
    28: "#008700", 111: "#87afff", 141: "#af87ff",
    244: "#808080", 246: "#949494", 250: "#bcbcbc", 231: "#ffffff",
}
def ansi256(n):
    if n in PALETTE: return PALETTE[n]
    if n < 16:
        base = ["#000000","#800000","#008000","#808000","#000080","#800080","#008080","#c0c0c0",
                 "#808080","#ff0000","#00ff00","#ffff00","#0000ff","#ff00ff","#00ffff","#ffffff"]
        return base[n]
    if n < 232:
        n -= 16
        steps = [0, 95, 135, 175, 215, 255]
        r, g, b = steps[(n // 36) % 6], steps[(n // 6) % 6], steps[n % 6]
        return f"#{r:02x}{g:02x}{b:02x}"
    return f"#{(8 + (n - 232) * 10):02x}" * 3

class Cell:
    __slots__ = ("ch", "fg", "bg", "bold")
    def __init__(self):
        self.ch = " "
        self.fg = "#c8d3f5"
        self.bg = "#1a1b26"
        self.bold = False

class Screen:
    def __init__(self, rows=26, cols=80):
        self.rows, self.cols = rows, cols
        self.grid = [[Cell() for _ in range(cols)] for _ in range(rows)]
        self.cx, self.cy = 0, 0
        self.fg, self.bg = "#c8d3f5", "#1a1b26"
        self.bold = False
        self.alt = False   # alt-screen apps repaint rows in place — never scroll

    def clear(self):
        for r in self.grid:
            for c in r:
                c.ch, c.fg, c.bg, c.bold = " ", self.fg, self.bg, False
        self.cx = self.cy = 0

    def scroll_up(self):
        del self.grid[0]
        self.grid.append([Cell() for _ in range(self.cols)])

    def print(self, text):
        for ch in text:
            if ch == "\n":
                self.cx = 0
                self.cy += 1
                if self.cy >= self.rows:
                    if self.alt:
                        self.cy = self.rows - 1
                    else:
                        self.scroll_up(); self.cy = self.rows - 1
                continue
            if ch == "\r":
                self.cx = 0
                continue
            if self.cy < self.rows and self.cx < self.cols:
                cell = self.grid[self.cy][self.cx]
                cell.ch, cell.fg, cell.bg, cell.bold = ch, self.fg, self.bg, self.bold
            self.cx += 1
            if self.cx >= self.cols:
                self.cx = 0
                self.cy += 1
                if self.cy >= self.rows:
                    if self.alt:
                        self.cy = self.rows - 1
                    else:
                        self.scroll_up(); self.cy = self.rows - 1

    def set_fg(self, color): self.fg = color
    def set_bg(self, color): self.bg = color
    def set_default_fg(self): self.fg = "#c8d3f5"
    def set_default_bg(self): self.bg = "#1a1b26"

# ── ANSI parser ─────────────────────────────────────────────────────────
ESC = "\x1b"
TOKEN = re.compile(r"(\x1b\[[0-9;?]*[a-zA-Z@]|\x1b\][^\x07]*\x07|\x1b.)")

def parse_sgr(params, scr: Screen):
    parts = params.split(";") if params else ["0"]
    i = 0
    while i < len(parts):
        p = parts[i]
        if p == "" or p == "0":
            scr.bold = False; scr.fg = "#c8d3f5"; scr.bg = "#1a1b26"; i += 1; continue
        if p == "1": scr.bold = True; i += 1; continue
        if p == "22": scr.bold = False; i += 1; continue
        if p in ("39", "49"):
            if p == "39": scr.fg = "#c8d3f5"
            else: scr.bg = "#1a1b26"
            i += 1; continue
        if p == "38" or p == "48":
            target = "fg" if p == "38" else "bg"
            if i + 1 < len(parts) and parts[i + 1] in ("5", "2"):
                mode = parts[i + 1]
                if mode == "5" and i + 2 < len(parts):
                    val = int(parts[i + 2]); col = ansi256(val)
                    if target == "fg": scr.fg = col
                    else: scr.bg = col
                    i += 3; continue
                if mode == "2" and i + 4 < len(parts):
                    r, g, b = (int(parts[i + 2]), int(parts[i + 3]), int(parts[i + 4]))
                    col = f"#{r:02x}{g:02x}{b:02x}"
                    if target == "fg": scr.fg = col
                    else: scr.bg = col
                    i += 5; continue
            i += 1; continue
        try:
            n = int(p)
            col = ansi256(n) if 0 <= n <= 255 else None
            if col:
                # 30-37 default fg, 40-47 default bg, 90-97 bright fg
                if 30 <= n <= 37 or 90 <= n <= 97: scr.fg = col
                elif 40 <= n <= 47: scr.bg = col
                else: scr.fg = col
        except ValueError:
            pass
        i += 1

def feed(scr: Screen, data: bytes):
    text = data.decode("utf-8", "replace")
    for tok in TOKEN.split(text):
        if not tok: continue
        if tok.startswith(ESC + "["):
            body = tok[2:-1]
            cmd = tok[-1]
            if cmd == "m":
                parse_sgr(body, scr); continue
            if cmd in ("H", "f"):
                parts = body.split(";") if body else ["1"]
                try:
                    y = int(parts[0]) if parts[0] else 1
                    x = int(parts[1]) if len(parts) > 1 and parts[1] else 1
                    scr.cy, scr.cx = max(0, y - 1), max(0, x - 1)
                except ValueError: pass
                continue
            if cmd == "J":
                if body in ("", "2"): scr.clear()
                continue
            if cmd == "h" and body == "?1049":
                scr.alt = True; scr.clear(); continue
            if cmd == "l" and body == "?1049":
                scr.alt = False; continue
            if cmd == "K":
                if scr.cy < scr.rows:
                    for x in range(scr.cx, scr.cols):
                        cell = scr.grid[scr.cy][x]
                        cell.ch = " "; cell.fg = "#c8d3f5"; cell.bg = "#1a1b26"; cell.bold = False
                continue
            if cmd == "A":
                scr.cy = max(0, scr.cy - (int(body) if body else 1)); continue
            if cmd == "B":
                scr.cy = min(scr.rows - 1, scr.cy + (int(body) if body else 1)); continue
            if cmd == "C":
                scr.cx = min(scr.cols - 1, scr.cx + (int(body) if body else 1)); continue
            if cmd == "D":
                scr.cx = max(0, scr.cx - (int(body) if body else 1)); continue
            continue  # unknown CSI, ignore
        if tok.startswith(ESC + "]"):
            continue  # OSC, ignore
        if tok.startswith(ESC):
            continue  # single-char escape, ignore
        scr.print(tok)

# Block/box glyphs drawn as rectangles — fonts on this box lack them (tofu).
BLOCKS = {
    "\u2588": [(0, 0, 1, 1)],              # full block
    "\u2580": [(0, 0, 1, 0.5)],            # upper half
    "\u2584": [(0, 0.5, 1, 1)],            # lower half
    "\u258c": [(0, 0, 0.5, 1)],            # left half
    "\u2590": [(0.5, 0, 1, 1)],            # right half
    "\u258d": [(0, 0, 0.18, 1)],           # left one eighth
    "\u258e": [(0, 0, 0.25, 1)],           # left one quarter
    "\u258f": [(0, 0, 0.34, 1)],           # left three eighths
    "\u2593": [(0, 0, 1, 0.25)],           # upper one quarter
    "\u2592": [(0, 0.75, 1, 1)],           # lower one quarter
    "\u2591": [(0, 0, 0.34, 0.5)],        # quadrant upper left
    "\u2592b": [(0, 0, 1, 1)],
    "\u2595": [(0, 0.5, 1, 1)],
}

def render(scr: Screen, cell_w: int, cell_h: int):
    img = Image.new("RGB", (scr.cols * cell_w, scr.rows * cell_h), "#1a1b26")
    draw = ImageDraw.Draw(img)
    font_size = int(cell_h * 0.72)
    try:
        f_norm = ImageFont.truetype(FONT_MONO, font_size)
        f_bold = ImageFont.truetype(FONT_MONO_BOLD, font_size)
    except Exception:
        f_norm = f_bold = ImageFont.load_default()
    for y, row in enumerate(scr.grid):
        for x, cell in enumerate(row):
            px, py = x * cell_w, y * cell_h
            if cell.bg != "#1a1b26":
                draw.rectangle([px, py, px + cell_w, py + cell_h], fill=cell.bg)
            if cell.ch in BLOCKS:
                for (rx0, ry0, rx1, ry1) in BLOCKS[cell.ch]:
                    draw.rectangle(
                        [px + rx0 * cell_w, py + ry0 * cell_h, px + rx1 * cell_w - 1, py + ry1 * cell_h - 1],
                        fill=cell.fg,
                    )
            elif cell.ch != " ":
                font = f_bold if cell.bold else f_norm
                draw.text((px + 1, py + 1), cell.ch, font=font, fill=cell.fg)
    return img

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True)
    ap.add_argument("--rows", type=int, default=26)
    ap.add_argument("--cols", type=int, default=80)
    ap.add_argument("--cell-w", type=int, default=16)
    ap.add_argument("--cell-h", type=int, default=18)
    ap.add_argument("--png", help="write final frame as PNG")
    ap.add_argument("--out-dir", help="dump every Nth frame here")
    ap.add_argument("--frame-stride", type=int, default=8, help="dump every Nth frame when splitting on newlines")
    args = ap.parse_args()

    raw = open(args.input, "rb").read()
    scr = Screen(args.rows, args.cols)

    if args.png:
        feed(scr, raw)
        img = render(scr, args.cell_w, args.cell_h)
        img.save(args.png)
        print("wrote", args.png)
        return

    if args.out_dir:
        import os
        os.makedirs(args.out_dir, exist_ok=True)
        # split on clear-screen markers (2J) to get distinct frames
        chunks = raw.split(b"\x1b[2J")
        saved = 0
        for idx, chunk in enumerate(chunks):
            if idx % args.frame_stride: continue
            feed(scr, chunk)
            img = render(scr, args.cell_w, args.cell_h)
            path = f"{args.out_dir}/frame-{idx:04d}.png"
            img.save(path)
            saved += 1
        print(f"wrote {saved} frames to {args.out_dir}")
        return

if __name__ == "__main__":
    main()
