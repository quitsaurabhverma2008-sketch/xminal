import path from "node:path";
import { projectReceiptsDir } from "../config/paths";
import { AuditLog, type AuditVerification } from "../core/permissions";
import { readText } from "../util/fs";

export function verifyAudit(cwd: string): AuditVerification {
  return AuditLog.verifyFile(path.join(projectReceiptsDir(cwd), "audit.jsonl"));
}

export function tailAudit(cwd: string, count = 10): Array<Record<string, unknown>> {
  const file = path.join(projectReceiptsDir(cwd), "audit.jsonl");
  let content = "";
  try {
    content = readText(file);
  } catch {
    return [];
  }
  const entries: Array<Record<string, unknown>> = [];
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      entries.push(JSON.parse(trimmed) as Record<string, unknown>);
    } catch {
      // skip malformed
    }
  }
  return entries.slice(-Math.max(1, count));
}
