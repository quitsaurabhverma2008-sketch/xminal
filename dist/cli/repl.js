"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startRepl = startRepl;
const node_readline_1 = __importDefault(require("node:readline"));
const runtime_1 = require("../runtime");
const config_1 = require("../config/config");
const ansi_1 = require("../util/ansi");
const version_1 = require("../version");
const render_1 = require("./render");
const callbacks_1 = require("./callbacks");
const commands_1 = require("./commands");
async function startRepl(initial, options = {}) {
    const renderer = options.renderer ?? new render_1.Renderer();
    let runtime = initial;
    let busy = false;
    let closed = false;
    let currentAgent = runtime.agent;
    const rl = node_readline_1.default.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: process.stdin.isTTY === true,
        historySize: 500,
        removeHistoryDuplicates: true,
    });
    const callbacks = options.callbacks ?? (0, callbacks_1.rendererCallbacks)(renderer);
    const lineQueue = [];
    let rlClosed = false;
    const waiters = [];
    rl.on("line", (line) => {
        const waiter = waiters.shift();
        if (waiter)
            waiter(line);
        else
            lineQueue.push(line);
    });
    rl.on("close", () => {
        rlClosed = true;
        while (waiters.length > 0)
            waiters.shift()?.(null);
    });
    const ask = (text) => {
        process.stdout.write(text);
        if (lineQueue.length > 0)
            return Promise.resolve(lineQueue.shift());
        if (rlClosed)
            return Promise.resolve(null);
        return new Promise((resolve) => waiters.push(resolve));
    };
    const permissionAsk = async (tool, reason) => {
        const answer = await ask(`${ansi_1.ansi.yellow("?")} Allow ${ansi_1.ansi.bold(tool)} (${reason ?? "needs approval"})? [y/N] `);
        return answer !== null && /^y(es)?$/i.test(answer.trim());
    };
    const attach = (next) => {
        next.setAskHandler(permissionAsk);
    };
    const restart = (restartOptions) => {
        const previous = runtime;
        const next = new runtime_1.Runtime(runtime.cwd, {
            mode: runtime.agent.mode,
            model: runtime.agent.modelSpec,
            sessionId: restartOptions?.sessionId,
            newSession: restartOptions?.newSession,
            callbacks,
            askHandler: permissionAsk,
        });
        attach(next);
        runtime = next;
        currentAgent = next.agent;
        ctx.runtime = next;
        previous.close();
    };
    const ctx = {
        runtime,
        renderer,
        cwd: runtime.cwd,
        exit: () => {
            closed = true;
            rl.close();
        },
        restart,
        ask,
    };
    attach(runtime);
    rl.on("SIGINT", () => {
        if (busy) {
            currentAgent.abort();
            renderer.flush();
            renderer.warn("aborted current turn");
            return;
        }
        renderer.flush();
        closed = true;
        rl.close();
    });
    rl.on("close", () => {
        closed = true;
    });
    let modelLabel = runtime.agent.modelSpec;
    try {
        const resolved = (0, config_1.resolveModel)(runtime.config, runtime.agent.modelSpec);
        modelLabel = `${resolved.alias} (${resolved.provider}/${resolved.model})`;
    }
    catch {
        modelLabel = `${runtime.agent.modelSpec} — no provider configured`;
    }
    renderer.banner(version_1.VERSION, modelLabel, runtime.agent.mode);
    if (modelLabel.includes("no provider configured")) {
        renderer.warn("No provider credentials found. Set an API key (e.g. OPENROUTER_API_KEY) or run /doctor, then restart xminal.");
    }
    renderer.status(`session ${runtime.session.id} · ${runtime.cwd}`);
    if (runtime.session.messages.length > 0) {
        renderer.status(`resumed session with ${runtime.session.messages.length} message(s)`);
    }
    while (!closed) {
        const input = await ask(ansi_1.ansi.magenta("› "));
        if (closed)
            break;
        if (input === null)
            break;
        const text = input.trim();
        if (!text)
            continue;
        if (text.startsWith("/")) {
            try {
                await (0, commands_1.handleCommand)(text, ctx);
            }
            catch (error) {
                renderer.error(error.message);
            }
            continue;
        }
        busy = true;
        currentAgent = runtime.agent;
        try {
            const result = await runtime.agent.run(text);
            renderer.flush();
            if (runtime.config.ui.showCost)
                renderer.status(renderer.costLine());
            if (result.stoppedReason === "budget")
                renderer.warn("stopped: cost limit reached");
            else if (result.stoppedReason === "max_turns")
                renderer.warn("stopped: max turns reached");
            else if (result.stoppedReason === "aborted")
                renderer.warn("stopped: aborted");
            else if (result.stoppedReason === "error")
                renderer.error("stopped: provider/agent error");
        }
        catch (error) {
            renderer.flush();
            renderer.error(error.message);
        }
        finally {
            busy = false;
        }
    }
    runtime.close();
}
//# sourceMappingURL=repl.js.map