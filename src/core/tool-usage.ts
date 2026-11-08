import path from "node:path";
import { appendLine, readText } from "../util/fs";
import { projectReceiptsDir } from "../config/paths";

export interface ToolUsageRecord {
  ts: string;
  model?: string;
  tool: string;
  server: string;
  detail?: string;
  argTokens: number;
  resultTokens: number;
  totalTokens: number;
  isError: boolean;
  durationMs: number;
}

export interface ToolUsageBucket {
  name: string;
  server: string;
  tool: string;
  detail?: string;
  calls: number;
  tokens: number;
  errors: number;
}

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

export function usageFile(cwd: string): string {
  return path.join(projectReceiptsDir(cwd), "tool-usage.jsonl");
}

export function recordToolUsage(
  cwd: string,
  entry: Omit<ToolUsageRecord, "ts" | "totalTokens">,
): void {
  const record: ToolUsageRecord = {
    ts: new Date().toISOString(),
    totalTokens: entry.argTokens + entry.resultTokens,
    ...entry,
  };
  try {
    appendLine(usageFile(cwd), JSON.stringify(record));
  } catch {
    // usage tracking must never break the agent
  }
}

export interface ToolUsageSummary {
  entries: number;
  totalCalls: number;
  totalTokens: number;
  totalErrors: number;
  byTool: ToolUsageBucket[];
}

export function loadToolUsage(cwd: string): ToolUsageSummary {
  let content = "";
  try {
    content = readText(usageFile(cwd));
  } catch {
    return { entries: 0, totalCalls: 0, totalTokens: 0, totalErrors: 0, byTool: [] };
  }
  const buckets = new Map<string, ToolUsageBucket>();
  let entries = 0;
  let totalTokens = 0;
  let totalErrors = 0;
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let record: ToolUsageRecord;
    try {
      record = JSON.parse(trimmed) as ToolUsageRecord;
    } catch {
      continue;
    }
    entries += 1;
    totalTokens += record.totalTokens ?? 0;
    if (record.isError) totalErrors += 1;
    const key = record.server + ":" + (record.detail ?? record.tool);
    const existing = buckets.get(key);
    if (existing) {
      existing.calls += 1;
      existing.tokens += record.totalTokens ?? 0;
      if (record.isError) existing.errors += 1;
    } else {
      buckets.set(key, {
        name: record.detail ? `${record.server}/${record.detail}` : `${record.server}/${record.tool}`,
        server: record.server,
        tool: record.tool,
        detail: record.detail,
        calls: 1,
        tokens: record.totalTokens ?? 0,
        errors: record.isError ? 1 : 0,
      });
    }
  }
  const byTool = [...buckets.values()].sort((a, b) => b.tokens - a.tokens);
  return { entries, totalCalls: entries, totalTokens, totalErrors, byTool };
}

export function formatTokens(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(2)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`;
  return String(count);
}
