"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.globToRegExp = globToRegExp;
exports.matchesGlob = matchesGlob;
function globToRegExp(glob) {
    let out = "^";
    for (let i = 0; i < glob.length; i++) {
        const char = glob[i];
        if (char === "*") {
            if (glob[i + 1] === "*") {
                out += ".*";
                i++;
                if (glob[i + 1] === "/")
                    i++;
            }
            else {
                out += "[^/]*";
            }
        }
        else if (char === "?") {
            out += "[^/]";
        }
        else if (char === "{") {
            const end = glob.indexOf("}", i);
            if (end === -1) {
                out += "\\{";
            }
            else {
                const parts = glob.slice(i + 1, end).split(",");
                out += "(?:" + parts.map((part) => part.replace(/[.+^$()|[\]\\]/g, "\\$&")).join("|") + ")";
                i = end;
            }
        }
        else if ("+^$()|[]\\.".includes(char)) {
            out += "\\" + char;
        }
        else {
            out += char;
        }
    }
    out += "$";
    return new RegExp(out);
}
function matchesGlob(glob, filePath) {
    return globToRegExp(glob).test(filePath);
}
//# sourceMappingURL=glob.js.map