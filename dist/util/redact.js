"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.redactSecrets = redactSecrets;
exports.redactSecretsInPlace = redactSecretsInPlace;
const PATTERNS = [
    { pattern: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g, label: "private-key" },
    { pattern: /sk-[A-Za-z0-9_-]{20,}/g, label: "api-key" },
    { pattern: /sk-ant-[A-Za-z0-9_-]{20,}/g, label: "api-key" },
    { pattern: /sk-or-[A-Za-z0-9_-]{20,}/g, label: "api-key" },
    { pattern: /ghp_[A-Za-z0-9]{20,}/g, label: "github-token" },
    { pattern: /gho_[A-Za-z0-9]{20,}/g, label: "github-token" },
    { pattern: /github_pat_[A-Za-z0-9_]{20,}/g, label: "github-token" },
    { pattern: /AIza[0-9A-Za-z_-]{20,}/g, label: "google-api-key" },
    { pattern: /xox[baprs]-[0-9A-Za-z-]{10,}/g, label: "slack-token" },
    { pattern: /eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,}/g, label: "jwt" },
];
function redactSecrets(text) {
    if (!text)
        return { text, count: 0 };
    let count = 0;
    let out = text;
    for (const { pattern, label } of PATTERNS) {
        out = out.replace(pattern, () => {
            count += 1;
            return `[REDACTED:${label}]`;
        });
    }
    return { text: out, count };
}
function redactSecretsInPlace(content) {
    const { text, count } = redactSecrets(content);
    return { content: text, count };
}
//# sourceMappingURL=redact.js.map