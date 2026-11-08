"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Renderer = void 0;
const ansi_1 = require("../util/ansi");
class Renderer {
    inText = false;
    inReasoning = false;
    lastUsage;
    banner(version, model, mode) {
        const logo = [
            "██╗  ██╗███╗   ███╗██╗███╗   ██╗ █████╗ ██╗",
            "╚██╗██╔╝████╗ ████║██║████╗  ██║██╔══██╗██║",
            " ╚███╔╝ ██╔████╔██║██║██╔██╗ ██║███████║██║",
            " ██╔██╗ ██║╚██╔╝██║██║██║╚██╗██║██╔══██║██║",
            "██╔╝ ██╗██║ ╚═╝ ██║██║██║ ╚████║██║  ██║███████╗",
            "╚═╝  ╚═╝╚═╝     ╚═╝╚═╝╚═╝  ╚═══╝╚═╝  ╚═╝╚══════╝",
        ].join("\n");
        console.log(ansi_1.ansi.cyan(logo));
        console.log(ansi_1.ansi.gray(`v${version} · model ${model} · mode ${mode}`));
        console.log(ansi_1.ansi.gray("Type /help for commands, /exit to quit. Ctrl+C aborts the current turn.\n"));
    }
    userPrompt() {
        this.flush();
        console.log(ansi_1.ansi.bold(ansi_1.ansi.magenta("› ")) + ansi_1.ansi.gray(""));
    }
    assistantStart() {
        this.flush();
    }
    text(chunk) {
        if (!this.inText) {
            if (this.inReasoning)
                this.flush();
            process.stdout.write(ansi_1.ansi.cyan("xmin") + ansi_1.ansi.gray(" › "));
            this.inText = true;
        }
        process.stdout.write(chunk);
    }
    reasoning(chunk) {
        if (!this.inReasoning) {
            this.flush();
            process.stdout.write(ansi_1.ansi.gray("thinking: "));
            this.inReasoning = true;
        }
        process.stdout.write(ansi_1.ansi.gray(chunk));
    }
    toolCall(call) {
        this.flush();
        const summary = summarizeToolArgs(call.name, call.arguments);
        console.log(`${ansi_1.ansi.yellow("●")} ${ansi_1.ansi.bold(call.name)}${summary ? ansi_1.ansi.gray(`(${summary})`) : ""}`);
    }
    toolResult(name, result) {
        this.flush();
        const lines = result.content.split("\n");
        const first = lines[0] ?? "";
        const icon = result.isError ? ansi_1.ansi.red("✗") : ansi_1.ansi.green("✓");
        console.log(`  ${icon} ${ansi_1.ansi.gray(truncate(first, 220))}`);
        if (result.isError) {
            const extra = lines.slice(1, 6).join("\n");
            if (extra)
                console.log(ansi_1.ansi.gray(indent(truncate(extra, 1200), "    ")));
        }
        if (lines.length > 6 && !result.isError) {
            console.log(ansi_1.ansi.gray(`    … ${lines.length - 1} more lines (full output sent to the model)`));
        }
    }
    usage(usage, model) {
        const cost = (usage.inputTokens / 1_000_000) * model.inputPricePerMTok +
            (usage.outputTokens / 1_000_000) * model.outputPricePerMTok;
        this.lastUsage = {
            input: (this.lastUsage?.input ?? 0) + usage.inputTokens,
            output: (this.lastUsage?.output ?? 0) + usage.outputTokens,
            cost: (this.lastUsage?.cost ?? 0) + cost,
        };
    }
    status(message) {
        this.flush();
        console.log(ansi_1.ansi.gray(`· ${message}`));
    }
    info(message) {
        this.flush();
        console.log(ansi_1.ansi.cyan(message));
    }
    success(message) {
        this.flush();
        console.log(ansi_1.ansi.green(message));
    }
    warn(message) {
        this.flush();
        console.log(ansi_1.ansi.yellow(message));
    }
    error(message) {
        this.flush();
        console.log(ansi_1.ansi.red(message));
    }
    costLine() {
        if (!this.lastUsage)
            return "no usage recorded";
        return `${this.lastUsage.input} in / ${this.lastUsage.output} out tokens · $${this.lastUsage.cost.toFixed(6)}`;
    }
    flush() {
        if (this.inText || this.inReasoning) {
            process.stdout.write("\n");
            this.inText = false;
            this.inReasoning = false;
        }
    }
}
exports.Renderer = Renderer;
function summarizeToolArgs(name, raw) {
    let args = {};
    try {
        args = JSON.parse(raw || "{}");
    }
    catch {
        return truncate(raw, 100);
    }
    if (name === "bash")
        return truncate(String(args.command ?? ""), 120);
    if (name === "read" || name === "write" || name === "edit" || name === "multi_edit") {
        return truncate(String(args.path ?? ""), 120);
    }
    if (name === "glob" || name === "grep")
        return truncate(String(args.pattern ?? ""), 100);
    if (name === "task")
        return truncate(String(args.prompt ?? ""), 100);
    if (name === "mcp_call")
        return `${String(args.server ?? "")}/${String(args.tool ?? "")}`;
    const values = Object.entries(args)
        .slice(0, 2)
        .map(([key, value]) => `${key}=${truncate(String(value), 40)}`);
    return values.join(", ");
}
function truncate(text, width) {
    return text.length <= width ? text : text.slice(0, width - 1) + "…";
}
function indent(text, prefix) {
    return text
        .split("\n")
        .map((line) => prefix + line)
        .join("\n");
}
//# sourceMappingURL=render.js.map