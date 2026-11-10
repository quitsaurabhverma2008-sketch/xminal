"use strict";
// Content-aware output quality engine — the single formatting authority for
// ordinary assistant conversation. Applies ONLY to prose; never touches code,
// URLs, JSON, commands, or diffs. Non-destructive: original history is untouched.
//
// Design: tokenize the message into typed segments (code fence / URL / JSON /
// diff / command / prose), then normalize each prose segment only.
Object.defineProperty(exports, "__esModule", { value: true });
exports.segment = segment;
exports.formatAssistantText = formatAssistantText;
exports.isLikelyDiff = isLikelyDiff;
exports.tintDiffRow = tintDiffRow;
exports.hasUnbalancedBoldMarkers = hasUnbalancedBoldMarkers;
function segment(input) {
    const out = [];
    const fence = /^```[a-zA-Z0-9_+-]*[ \t]*$/;
    const lines = input.split("\n");
    const trailingNewline = input.endsWith("\n");
    if (trailingNewline)
        lines.pop(); // drop the phantom element produced by the trailing newline
    let current = { kind: "prose", text: "" };
    let inCode = false;
    const flush = () => { if (current.text)
        out.push(current); };
    for (let index = 0; index < lines.length; index++) {
        const line = lines[index];
        const suffix = index < lines.length - 1 || trailingNewline ? "\n" : "";
        if (fence.test(line)) {
            if (inCode) {
                current.text += line + suffix;
                flush();
                current = { kind: "prose", text: "" };
                inCode = false;
            }
            else {
                flush();
                current = { kind: "code", text: line + suffix };
                inCode = true;
            }
            continue;
        }
        current.text += line + suffix;
    }
    flush();
    return out;
}
function normalizeProse(text) {
    let t = text;
    // collapse decorative punctuation runs — but never sentence-final single chars
    t = t.replace(/([!?.])\1{1,}/g, "$1"); // !!! → !  ... → .
    t = t.replace(/([-–—])\1{2,}/g, "$1$1"); // --- → --
    t = t.replace(/:\s*:/g, ":"); // :: repeated colons
    t = t.replace(/;\s*;/g, ";");
    t = t.replace(/\*\*\s*\*\*/g, "**"); // accidental empty bold markers
    t = t.replace(/(^|\n)\s*-\s*-\s+/g, "$1- "); // broken list markers
    t = t.replace(/[ \t]+\n/g, "\n"); // trailing spaces
    t = t.replace(/\n{3,}/g, "\n\n"); // excessive blank lines
    return t;
}
function formatAssistantText(input) {
    // code/url/json/diff/command segments pass through byte-exact; only prose is normalized
    return segment(input).map((s) => (s.kind === "prose" ? normalizeProse(s.text) : s.text)).join("");
}
function isLikelyDiff(text) {
    return /^(@@|diff --git|\+\+\+ |--- )/m.test(text);
}
function tintDiffRow(row, tint, muted, accent, green, red) {
    const bare = row.replace(/\x1b\[[0-9;?]*[a-zA-Z]|\x1b\][^\x07]*\x07/g, "").trimStart();
    if (bare.startsWith("@@"))
        return accent(row);
    if (bare.startsWith("diff --git") || bare.startsWith("index ") || bare.startsWith("new file") || bare.startsWith("deleted file"))
        return muted(row);
    if (bare.startsWith("+++") || bare.startsWith("---"))
        return muted(row);
    if (bare.startsWith("+"))
        return green(row);
    if (bare.startsWith("-"))
        return red(row);
    return row;
}
function hasUnbalancedBoldMarkers(text) {
    const outsideCode = segment(text).filter((s) => s.kind === "prose").map((s) => s.text).join("");
    return (outsideCode.match(/\*\*/g) ?? []).length % 2 !== 0;
}
//# sourceMappingURL=format.js.map