"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reset = exports.theme = void 0;
exports.rule = rule;
exports.box = box;
exports.tag = tag;
exports.statusPill = statusPill;
exports.formatCost = formatCost;
exports.modeColor = modeColor;
const ansi_1 = require("../util/ansi");
exports.theme = {
    bg: "\x1b[48;5;234m",
    raised: "\x1b[48;5;236m",
    border: "\x1b[38;5;239m",
    text: "\x1b[38;5;253m",
    muted: "\x1b[38;5;245m",
    accent: "\x1b[38;5;51m",
    accent2: "\x1b[38;5;45m",
    violet: "\x1b[38;5;141m",
    green: "\x1b[38;5;120m",
    yellow: "\x1b[38;5;221m",
    red: "\x1b[38;5;203m",
    cyan: "\x1b[38;5;45m",
};
exports.reset = "\x1b[0m";
function rule(width) {
    return exports.theme.border + "─".repeat(width) + exports.reset;
}
function box(width, height, title, fill) {
    const inner = Math.max(8, width - 2);
    const lines = fill(inner);
    const out = [];
    const label = title ? `─ ${title} ` : "─";
    out.push(exports.theme.border + "┌" + label + "─".repeat(Math.max(0, inner - label.length)) + "┐" + exports.reset);
    for (const line of lines.slice(0, Math.max(0, height - 2))) {
        out.push(exports.theme.border + "│" + exports.reset + (0, ansi_1.pad)((0, ansi_1.truncate)(line, inner), inner) + exports.theme.border + "│" + exports.reset);
    }
    out.push(exports.theme.border + "└" + "─".repeat(inner) + "┘" + exports.reset);
    return out;
}
function tag(key, value) {
    return `${exports.theme.muted}${key}${exports.reset} ${exports.theme.text}${value}${exports.reset}`;
}
function statusPill(status) {
    switch (status) {
        case "in_progress":
            return exports.theme.accent + "▶ " + exports.reset;
        case "completed":
            return exports.theme.green + "✓ " + exports.reset;
        case "blocked":
            return exports.theme.red + "! " + exports.reset;
        default:
            return exports.theme.muted + "○ " + exports.reset;
    }
}
function formatCost(cost) {
    return cost < 0.01 ? `$${cost.toFixed(6)}` : `$${cost.toFixed(4)}`;
}
function modeColor(mode) {
    switch (mode) {
        case "plan":
            return exports.theme.yellow;
        case "build":
            return exports.theme.accent;
        case "compose":
            return exports.theme.violet;
        case "review":
            return exports.theme.cyan;
        case "yolo":
            return exports.theme.red;
    }
}
//# sourceMappingURL=engine.js.map