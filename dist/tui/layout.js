"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.wrapText = wrapText;
exports.matchCommands = matchCommands;
const ansi_1 = require("../util/ansi");
function wrapText(text, width) {
    const out = [];
    for (const raw of text.split("\n")) {
        let line = raw;
        while ((0, ansi_1.visibleLength)(line) > width) {
            const slice = line.slice(0, width);
            const lastSpace = slice.lastIndexOf(" ");
            if (lastSpace > 0) {
                out.push(line.slice(0, lastSpace).trimEnd());
                line = line.slice(lastSpace).trimStart();
            }
            else {
                out.push(line.slice(0, width));
                line = line.slice(width);
            }
        }
        out.push(line);
    }
    return out;
}
function matchCommands(input, commands) {
    if (!input.startsWith("/") || input.includes(" "))
        return [];
    const q = input.toLowerCase();
    return commands.filter((c) => c.startsWith(q));
}
//# sourceMappingURL=layout.js.map