/**
 * Tool argument parsing and validation.
 *
 * Two silent failure modes used to hide here:
 *   1. malformed JSON from the model became `{}` and the tool ran with no
 *      arguments (confusing result, model never learned what happened);
 *   2. missing/wrong-typed arguments hit the tool's internals and produced a
 *      generic crash instead of naming the field.
 *
 * Both now become explicit observations the model can act on.
 */

export interface ParsedToolArguments {
  readonly args?: Record<string, unknown>;
  readonly error?: string;
}

/** Parse a raw arguments string. Never throws. */
export function parseToolArguments(raw: string | undefined): ParsedToolArguments {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { args: {} };
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { error: `expected a JSON object, got ${Array.isArray(parsed) ? "an array" : typeof parsed}` };
    }
    return { args: parsed as Record<string, unknown> };
  } catch (error) {
    const detail = (error as SyntaxError)?.message ?? String(error);
    return { error: `invalid JSON (${detail.length > 120 ? detail.slice(0, 120) + "…" : detail})` };
  }
}

export interface ArgumentValidation {
  readonly ok: boolean;
  readonly errors: string[];
}

const TYPE_OF: Record<string, (value: unknown) => boolean> = {
  string: (v) => typeof v === "string",
  number: (v) => typeof v === "number" && Number.isFinite(v),
  integer: (v) => typeof v === "number" && Number.isInteger(v),
  boolean: (v) => typeof v === "boolean",
  array: (v) => Array.isArray(v),
  object: (v) => v !== null && typeof v === "object" && !Array.isArray(v),
};

/**
 * Validate args against the tool's advertised parameters (JSON-Schema-lite:
 * required fields and top-level property types). Extra properties are allowed
 * — rejecting them would break forward compatibility.
 */
export function validateToolArguments(
  parameters: Record<string, unknown> | undefined,
  args: Record<string, unknown>,
): ArgumentValidation {
  const errors: string[] = [];
  const props = (parameters?.properties ?? {}) as Record<string, { type?: string; description?: string }>;
  const required = (parameters?.required ?? []) as string[];
  for (const field of required) {
    if (args[field] === undefined || args[field] === null) {
      errors.push(`missing required argument "${field}"`);
    }
  }
  for (const [field, value] of Object.entries(args)) {
    if (value === undefined) continue;
    const spec = props[field];
    if (!spec?.type) continue;
    const check = TYPE_OF[spec.type];
    if (check && !check(value)) {
      errors.push(`"${field}" must be a ${spec.type}, got ${Array.isArray(value) ? "array" : typeof value}`);
    }
  }
  return { ok: errors.length === 0, errors };
}
