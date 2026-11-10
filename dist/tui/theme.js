"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.inlineCode = exports.fgText = exports.fgMuted = exports.fgRed = exports.fgPurple = exports.fgGreen = exports.fgAmber = exports.fgAccent = exports.T = exports.ITALIC = exports.BOLD = exports.RESET = exports.bgRgb = exports.rgb = void 0;
// Tokyo Night palette — single source for TUI design tokens.
const rgb = (c) => `\x1b[38;2;${c[0]};${c[1]};${c[2]}m`;
exports.rgb = rgb;
const bgRgb = (c) => `\x1b[48;2;${c[0]};${c[1]};${c[2]}m`;
exports.bgRgb = bgRgb;
exports.RESET = "\x1b[0m";
exports.BOLD = "\x1b[1m";
exports.ITALIC = "\x1b[3m";
exports.T = {
    bg: [16, 17, 20],
    panel: [27, 29, 34],
    panel2: [35, 38, 45],
    border: [56, 59, 68],
    text: [230, 232, 236],
    muted: [139, 143, 153],
    accent: [122, 162, 247],
    amber: [224, 175, 104],
    green: [158, 206, 106],
    red: [247, 118, 142],
};
const fgAccent = (t) => `${(0, exports.rgb)(exports.T.accent)}${t}${exports.RESET}`;
exports.fgAccent = fgAccent;
const fgAmber = (t) => `${(0, exports.rgb)(exports.T.amber)}${t}${exports.RESET}`;
exports.fgAmber = fgAmber;
const fgGreen = (t) => `${(0, exports.rgb)(exports.T.green)}${t}${exports.RESET}`;
exports.fgGreen = fgGreen;
const fgPurple = (t) => `${(0, exports.rgb)([187, 154, 247])}${t}${exports.RESET}`;
exports.fgPurple = fgPurple;
const fgRed = (t) => `${(0, exports.rgb)(exports.T.red)}${t}${exports.RESET}`;
exports.fgRed = fgRed;
const fgMuted = (t) => `${(0, exports.rgb)(exports.T.muted)}${t}${exports.RESET}`;
exports.fgMuted = fgMuted;
const fgText = (t) => `${(0, exports.rgb)(exports.T.text)}${t}${exports.RESET}`;
exports.fgText = fgText;
const inlineCode = (t) => `${(0, exports.bgRgb)(exports.T.panel2)}${(0, exports.rgb)(exports.T.accent)} ${t} ${exports.RESET}`;
exports.inlineCode = inlineCode;
//# sourceMappingURL=theme.js.map