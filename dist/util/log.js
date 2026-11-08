"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.log = void 0;
exports.setLogLevel = setLogLevel;
const ansi_1 = require("./ansi");
let level = process.env.XMINAL_LOG || "info";
function setLogLevel(next) {
    level = next;
}
const order = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };
function enabled(target) {
    return order[target] >= order[level];
}
exports.log = {
    debug: (...args) => {
        if (enabled("debug"))
            console.error(ansi_1.ansi.gray("[debug]"), ...args);
    },
    info: (...args) => {
        if (enabled("info"))
            console.error(ansi_1.ansi.cyan("[xminal]"), ...args);
    },
    warn: (...args) => {
        if (enabled("warn"))
            console.error(ansi_1.ansi.yellow("[warn]"), ...args);
    },
    error: (...args) => {
        if (enabled("error"))
            console.error(ansi_1.ansi.red("[error]"), ...args);
    },
};
//# sourceMappingURL=log.js.map