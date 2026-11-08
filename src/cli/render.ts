import { ansi } from "../util/ansi";
import type { ChatUsage, ToolCall } from "../providers/types";
import type { ResolvedModel } from "../config/types";
import type { ToolResult } from "../tools/types";

export class Renderer {
  private inText = false;
  private inReasoning = false;
  private lastUsage?: { input: number; output: number; cost: number };

  banner(version: string, model: string, mode: string): void {
    const logo = [
      "██╗  ██╗███╗   ███╗██╗███╗   ██╗ █████╗ ██╗",
      "╚██╗██╔╝████╗ ████║██║████╗  ██║██╔══██╗██║",
      " ╚███╔╝ ██╔████╔██║██║██╔██╗ ██║███████║██║",
      " ██╔██╗ ██║╚██╔╝██║██║██║╚██╗██║██╔══██║██║",
      "██╔╝ ██╗██║ ╚═╝ ██║██║██║ ╚████║██║  ██║███████╗",
      "╚═╝  ╚═╝╚═╝     ╚═╝╚═╝╚═╝  ╚═══╝╚═╝  ╚═╝╚══════╝",
    ].join("\n");
    console.log(ansi.cyan(logo));
    console.log(ansi.gray(`v${version} · model ${model} · mode ${mode}`));
    console.log(ansi.gray("Type /help for commands, /exit to quit. Ctrl+C aborts the current turn.\n"));
  }

  userPrompt(): void {
    this.flush();
    console.log(ansi.bold(ansi.magenta("› ")) + ansi.gray(""));
  }

  assistantStart(): void {
    this.flush();
  }

  text(chunk: string): void {
    if (!this.inText) {
      if (this.inReasoning) this.flush();
      process.stdout.write(ansi.cyan("xmin") + ansi.gray(" › "));
      this.inText = true;
    }
    process.stdout.write(chunk);
  }

  reasoning(chunk: string): void {
    if (!this.inReasoning) {
      this.flush();
      process.stdout.write(ansi.gray("thinking: "));
      this.inReasoning = true;
    }
    process.stdout.write(ansi.gray(chunk));
  }

  toolCall(call: ToolCall): void {
    this.flush();
    const summary = summarizeToolArgs(call.name, call.arguments);
    console.log(`${ansi.yellow("●")} ${ansi.bold(call.name)}${summary ? ansi.gray(`(${summary})`) : ""}`);
  }

  toolResult(name: string, result: ToolResult): void {
    this.flush();
    const lines = result.content.split("\n");
    const first = lines[0] ?? "";
    const icon = result.isError ? ansi.red("✗") : ansi.green("✓");
    console.log(`  ${icon} ${ansi.gray(truncate(first, 220))}`);
    if (result.isError) {
      const extra = lines.slice(1, 6).join("\n");
      if (extra) console.log(ansi.gray(indent(truncate(extra, 1200), "    ")));
    }
    if (lines.length > 6 && !result.isError) {
      console.log(ansi.gray(`    … ${lines.length - 1} more lines (full output sent to the model)`));
    }
  }

  usage(usage: ChatUsage, model: ResolvedModel): void {
    const cost =
      (usage.inputTokens / 1_000_000) * model.inputPricePerMTok +
      (usage.outputTokens / 1_000_000) * model.outputPricePerMTok;
    this.lastUsage = {
      input: (this.lastUsage?.input ?? 0) + usage.inputTokens,
      output: (this.lastUsage?.output ?? 0) + usage.outputTokens,
      cost: (this.lastUsage?.cost ?? 0) + cost,
    };
  }

  status(message: string): void {
    this.flush();
    console.log(ansi.gray(`· ${message}`));
  }

  info(message: string): void {
    this.flush();
    console.log(ansi.cyan(message));
  }

  success(message: string): void {
    this.flush();
    console.log(ansi.green(message));
  }

  warn(message: string): void {
    this.flush();
    console.log(ansi.yellow(message));
  }

  error(message: string): void {
    this.flush();
    console.log(ansi.red(message));
  }

  costLine(): string {
    if (!this.lastUsage) return "no usage recorded";
    return `${this.lastUsage.input} in / ${this.lastUsage.output} out tokens · $${this.lastUsage.cost.toFixed(6)}`;
  }

  flush(): void {
    if (this.inText || this.inReasoning) {
      process.stdout.write("\n");
      this.inText = false;
      this.inReasoning = false;
    }
  }
}

function summarizeToolArgs(name: string, raw: string): string {
  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(raw || "{}") as Record<string, unknown>;
  } catch {
    return truncate(raw, 100);
  }
  if (name === "bash") return truncate(String(args.command ?? ""), 120);
  if (name === "read" || name === "write" || name === "edit" || name === "multi_edit") {
    return truncate(String(args.path ?? ""), 120);
  }
  if (name === "glob" || name === "grep") return truncate(String(args.pattern ?? ""), 100);
  if (name === "task") return truncate(String(args.prompt ?? ""), 100);
  if (name === "mcp_call") return `${String(args.server ?? "")}/${String(args.tool ?? "")}`;
  const values = Object.entries(args)
    .slice(0, 2)
    .map(([key, value]) => `${key}=${truncate(String(value), 40)}`);
  return values.join(", ");
}

function truncate(text: string, width: number): string {
  return text.length <= width ? text : text.slice(0, width - 1) + "…";
}

function indent(text: string, prefix: string): string {
  return text
    .split("\n")
    .map((line) => prefix + line)
    .join("\n");
}
