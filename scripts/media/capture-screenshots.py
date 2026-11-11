#!/usr/bin/env python3
"""Regenerate the README screenshots from the live TUI.

    python3 scripts/media/capture-screenshots.py [out-dir]

Every shot is a real PTY session of the built-in TUI (dist/index.js), so the
screenshots can never drift from the actual UI.
"""
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, HERE)

from capture import capture  # noqa: E402

OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "assets")
SCRATCH = "/data/data/com.termux/files/usr/tmp"
ENTRY = os.path.join(ROOT, "dist", "index.js")
XM = ["node", ENTRY]
BASE = {"XMINAL_TUI": "1", "TERM": "xterm-256color"}
CELL = {110: (13, 17), 92: (15, 17), 42: (24, 17)}


def shoot(name, script, cols=110, rows=30, settle=2.0, wait_extra=0.0):
    raw = os.path.join(SCRATCH, f"xminal-shot-{name}.bin")
    png = os.path.join(OUT, name + ".png")
    capture(raw, script, cols=cols, rows=rows, settle=settle, cwd=ROOT, cmd=XM, env_base=BASE)
    cw, ch = CELL.get(cols, (13, 17))
    subprocess.run(
        ["python3", os.path.join(HERE, "terminal_raster.py"),
         "--input", raw, "--png", png,
         "--rows", str(rows), "--cols", str(cols),
         "--cell-w", str(cw), "--cell-h", str(ch)],
        check=True, stdout=subprocess.DEVNULL,
    )
    print("✓", os.path.relpath(png, ROOT))
    os.remove(raw)


def boot(m, drain, shot):
    drain(2.4)
    shot()
    os.write(m, b"/exit\r")
    drain(0.8)


def conversation(m, drain, shot):
    drain(2.0)
    os.write(m, b"run the command: ls src/tui and then tell me what you see\r")
    drain(32.0)
    shot()
    os.write(m, b"/exit\r")
    drain(1.0)


def palette(m, drain, shot):
    drain(1.6)
    os.write(m, b"/")
    drain(1.4)
    shot()
    os.write(m, b"\x1b")
    drain(0.4)
    os.write(m, b"/exit\r")
    drain(0.8)


def models(m, drain, shot):
    drain(1.6)
    os.write(m, b"/model\r")
    drain(2.0)
    shot()
    os.write(m, b"\x1b")
    drain(0.4)
    os.write(m, b"/exit\r")
    drain(0.8)


def mcp(m, drain, shot):
    drain(1.6)
    os.write(m, b"/mcp\r")
    drain(1.2)
    os.write(m, b"filesystem")
    drain(1.4)
    shot()
    os.write(m, b"\x1b")
    drain(0.4)
    os.write(m, b"/exit\r")
    drain(0.8)


def provider(m, drain, shot):
    drain(1.6)
    os.write(m, b"/provider\r")
    drain(1.6)
    shot()
    os.write(m, b"\x1b")
    drain(0.4)
    os.write(m, b"/exit\r")
    drain(0.8)


def phone(m, drain, shot):
    drain(2.0)
    os.write(m, b"hi\r")
    drain(14.0)
    shot()
    os.write(m, b"\x03")
    drain(0.6)


def main():
    os.makedirs(OUT, exist_ok=True)
    shoot("screenshot-boot", boot)
    shoot("screenshot-conversation", conversation)
    shoot("screenshot-commands", palette)
    shoot("screenshot-model-picker", models)
    shoot("screenshot-mcp-catalog", mcp)
    shoot("screenshot-provider-wizard", provider)
    shoot("screenshot-phone", phone, cols=42, rows=26)


if __name__ == "__main__":
    main()
