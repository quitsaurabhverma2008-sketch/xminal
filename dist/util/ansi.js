"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ansi = void 0;
exports.stripAnsi = stripAnsi;
exports.visibleLength = visibleLength;
exports.pad = pad;
exports.truncate = truncate;
exports.banner = banner;
function colorsEnabled() {
    if (process.env.NO_COLOR !== undefined && process.env.NO_COLOR !== null)
        return false;
    return process.env.TERM !== "dumb";
}
function wrap(open, close) {
    return (text) => (colorsEnabled() ? `\u001b[${open}m${text}\u001b[${close}m` : text);
}
exports.ansi = {
    get enabled() {
        return colorsEnabled();
    },
    reset: "\u001b[0m",
    bold: wrap(1, 22),
    dim: wrap(2, 22),
    italic: wrap(3, 23),
    underline: wrap(4, 24),
    red: wrap(31, 39),
    green: wrap(32, 39),
    yellow: wrap(33, 39),
    blue: wrap(34, 39),
    magenta: wrap(35, 39),
    cyan: wrap(36, 39),
    white: wrap(37, 39),
    gray: wrap(90, 39),
    bgBlue: wrap(44, 49),
    bgMagenta: wrap(45, 49),
    get clearLine() {
        return colorsEnabled() ? "\r\u001b[2K" : "\r";
    },
    get hideCursor() {
        return colorsEnabled() ? "\u001b[?25l" : "";
    },
    get showCursor() {
        return colorsEnabled() ? "\u001b[?25h" : "";
    },
    get altScreen() {
        return colorsEnabled() ? "\u001b[?1049h" : "";
    },
    get mainScreen() {
        return colorsEnabled() ? "\u001b[?1049l" : "";
    },
};
function stripAnsi(text) {
    return text.replace(/\u001b\[[0-9;]*m/g, "");
}
function visibleLength(text) {
    return stripAnsi(text).length;
}
function pad(text, width, align = "left") {
    const diff = Math.max(0, width - visibleLength(text));
    return align === "left" ? text + " ".repeat(diff) : " ".repeat(diff) + text;
}
function truncate(text, width) {
    if (visibleLength(text) <= width)
        return text;
    return text.slice(0, Math.max(0, width - 1)) + "…";
}
function banner(version) {
    const logo = [
        "██╗  ██╗███╗   ███╗██╗███╗   ██╗ █████╗ ██╗",
        "╚██╗██╔╝████╗ ████║██║████╗  ██║██╔══██╗██║",
        " ╚███╔╝ ██╔████╔██║██║██╔██╗ ██║███████║██║",
        " ██╔██╗ ██║╚██╔╝██║██║██║╚██╗██║██╔══██║██║",
        "██╔╝ ██╗██║ ╚═╝ ██║██║██║ ╚████║██║  ██║███████╗",
        "╚═╝  ╚═╝╚═╝     ╚═╝╚═╝╚═╝  ╚═══╝╚═╝  ╚═╝╚══════╝",
    ].join("\n");
    return `${exports.ansi.cyan(logo)}\n${exports.ansi.gray(`v${version} · all-in-one terminal coding agent · /help for commands`)}`;
}
//# sourceMappingURL=ansi.js.map