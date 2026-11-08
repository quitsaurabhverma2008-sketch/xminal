"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.diffStat = diffStat;
exports.diffPreview = diffPreview;
function diffStat(before, after) {
    const a = before.split("\n");
    const b = after.split("\n");
    let start = 0;
    while (start < a.length && start < b.length && a[start] === b[start])
        start++;
    let endA = a.length - 1;
    let endB = b.length - 1;
    while (endA >= start && endB >= start && a[endA] === b[endB]) {
        endA--;
        endB--;
    }
    return { added: Math.max(0, endB - start + 1), removed: Math.max(0, endA - start + 1) };
}
function diffPreview(before, after, context = 2, maxLines = 60) {
    const a = before.split("\n");
    const b = after.split("\n");
    let start = 0;
    while (start < a.length && start < b.length && a[start] === b[start])
        start++;
    let endA = a.length - 1;
    let endB = b.length - 1;
    while (endA >= start && endB >= start && a[endA] === b[endB]) {
        endA--;
        endB--;
    }
    if (start > endA && start > endB)
        return "";
    const from = Math.max(0, start - context);
    const toA = Math.min(a.length, endA + 1 + context);
    const toB = Math.min(b.length, endB + 1 + context);
    const lines = [`@@ -${from + 1},${toA - from} +${from + 1},${toB - from} @@`];
    for (let i = from; i < start; i++)
        lines.push(`  ${a[i]}`);
    for (let i = start; i <= endA; i++)
        lines.push(`- ${a[i]}`);
    for (let i = start; i <= endB; i++)
        lines.push(`+ ${b[i]}`);
    for (let i = endA + 1; i < toA; i++)
        lines.push(`  ${a[i]}`);
    if (lines.length > maxLines) {
        return lines.slice(0, maxLines).join("\n") + `\n… (${lines.length - maxLines} more diff lines)`;
    }
    return lines.join("\n");
}
//# sourceMappingURL=diff.js.map