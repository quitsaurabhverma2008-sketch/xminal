"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.textResult = textResult;
exports.errorResult = errorResult;
exports.stringArg = stringArg;
exports.numberArg = numberArg;
exports.booleanArg = booleanArg;
function textResult(content, meta) {
    return { content, meta };
}
function errorResult(content) {
    return { content, isError: true };
}
function stringArg(args, key, fallback = "") {
    const value = args[key];
    if (typeof value === "string")
        return value;
    if (value === undefined || value === null)
        return fallback;
    return String(value);
}
function numberArg(args, key, fallback) {
    const value = args[key];
    if (typeof value === "number" && Number.isFinite(value))
        return value;
    if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value)))
        return Number(value);
    return fallback;
}
function booleanArg(args, key, fallback = false) {
    const value = args[key];
    if (typeof value === "boolean")
        return value;
    if (value === "true")
        return true;
    if (value === "false")
        return false;
    return fallback;
}
//# sourceMappingURL=types.js.map