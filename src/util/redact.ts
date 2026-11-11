const PATTERNS: Array<{ pattern: RegExp; label: string }> = [
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

export interface RedactionResult {
  text: string;
  count: number;
}

export function redactSecrets(text: string): RedactionResult {
  if (!text) return { text, count: 0 };
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

export function redactSecretsInPlace(content: string): { content: string; count: number } {
  const { text, count } = redactSecrets(content);
  return { content: text, count };
}

/** Secret-ish field names whose values must never be printed in full. */
const SECRET_FIELDS = new Set(["apikey", "key", "token", "secret", "password", "authorization"]);

/** Mask a single secret: keep the shape, hide the middle. */
export function maskSecretValue(value: string): string {
  if (!value) return value;
  if (value.length <= 8) return "*".repeat(value.length);
  return `${value.slice(0, 4)}…${value.slice(-2)} (${value.length} chars)`;
}

/**
 * Deep-copy a config object with every secret-looking value masked.
 * Used by `xminal config` so the output can be pasted into a bug report.
 */
export function maskConfigSecrets<T>(value: T): T {
  const walk = (node: unknown, key?: string): unknown => {
    if (Array.isArray(node)) return node.map((item) => walk(item));
    if (node && typeof node === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        out[k] = SECRET_FIELDS.has(k.toLowerCase()) && typeof v === "string" ? maskSecretValue(v) : walk(v, k);
      }
      return out;
    }
    if (typeof node === "string" && key && SECRET_FIELDS.has(key.toLowerCase())) return maskSecretValue(node);
    return node;
  };
  return walk(value) as T;
}
