"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reset = exports.theme = void 0;
exports.bgFill = bgFill;
exports.rule = rule;
exports.box = box;
exports.tag = tag;
exports.statusPill = statusPill;
exports.formatCost = formatCost;
exports.modeColor = modeColor;
const ansi_1 = require("../util/ansi");
const rgb = (r, g, b) => `\x1b[38;2;${r};${g};${b}m`;
const rgbBg = (r, g, b) => `\x1b[48;2;${r};${g};${b}m`;
// Tokyo Night — opencode's default dark theme (assets/tokyonight.json)
exports.theme = {
    bg: rgbBg(26, 27, 38), bgRgb: [26, 27, 38],
    raised: rgbBg(30, 32, 48), raisedRgb: [30, 32, 48],
    border: rgb(115, 122, 162), borderRgb: [115, 122, 162],
    text: rgb(200, 211, 245), textRgb: [200, 211, 245],
    muted: rgb(130, 139, 184), mutedRgb: [130, 139, 184],
    accent: rgb(130, 170, 255), accentRgb: [130, 170, 255],
    accent2: rgb(134, 225, 252), accent2Rgb: [134, 225, 252],
    violet: rgb(192, 153, 255),
    green: rgb(195, 232, 141),
    yellow: rgb(255, 199, 119),
    red: rgb(255, 117, 127),
    cyan: rgb(130, 170, 255), cyanRgb: [130, 170, 255],
};
exports.reset = "\x1b[0m";
function bgFill(rgbTriple, width) {
    return rgbBg(...rgbTriple) + " ".repeat(width);
}
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