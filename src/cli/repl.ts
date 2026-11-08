import readline from "node:readline";
import { Runtime } from "../runtime";
import type { AgentCallbacks } from "../core/agent";
import { resolveModel } from "../config/config";
import { ansi } from "../util/ansi";
import { VERSION } from "../version";
import { Renderer } from "./render";
import { rendererCallbacks } from "./callbacks";
import { handleCommand, type CommandContext } from "./commands";

export interface ReplOptions {
  renderer?: Renderer;
  callbacks?: AgentCallbacks;
}

export async function startRepl(initial: Runtime, options: ReplOptions = {}): Promise<void> {
  const renderer = options.renderer ?? new Renderer();
  let runtime = initial;
  let busy = false;
  let closed = false;
  let currentAgent = runtime.agent;

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
    historySize: 500,
    removeHistoryDuplicates: true,
  });

  const callbacks = options.callbacks ?? rendererCallbacks(renderer);

  const ask = (text: string): Promise<string> =>
    new Promise((resolve) => {
      let settled = false;
      const finish = (answer: string) => {
        if (settled) return;
        settled = true;
        rl.removeListener("close", onClose);
        resolve(answer);
      };
      const onClose = () => finish("");
      rl.once("close", onClose);
      rl.question(text, finish);
    });

  const permissionAsk = async (tool: string, reason?: string): Promise<boolean> => {
    const answer = await ask(`${ansi.yellow("?")} Allow ${ansi.bold(tool)} (${reason ?? "needs approval"})? [y/N] `);
    return /^y(es)?$/i.test(answer.trim());
  };

  const attach = (next: Runtime) => {
    next.setAskHandler(permissionAsk);
  };

  const restart = (restartOptions?: { sessionId?: string; newSession?: boolean }) => {
    const previous = runtime;
    const next = new Runtime(runtime.cwd, {
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

  const ctx: CommandContext = {
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
    const resolved = resolveModel(runtime.config, runtime.agent.modelSpec);
    modelLabel = `${resolved.alias} (${resolved.provider}/${resolved.model})`;
  } catch {
    modelLabel = `${runtime.agent.modelSpec} — no provider configured`;
  }
  renderer.banner(VERSION, modelLabel, runtime.agent.mode);
  if (modelLabel.includes("no provider configured")) {
    renderer.warn(
      "No provider credentials found. Set an API key (e.g. OPENROUTER_API_KEY) or run /doctor, then restart xminal.",
    );
  }
  renderer.status(`session ${runtime.session.id} · ${runtime.cwd}`);
  if (runtime.session.messages.length > 0) {
    renderer.status(`resumed session with ${runtime.session.messages.length} message(s)`);
  }

  while (!closed) {
    const input = await ask(ansi.magenta("› "));
    if (closed) break;
    const text = input.trim();
    if (!text) continue;

    if (text.startsWith("/")) {
      try {
        await handleCommand(text, ctx);
      } catch (error) {
        renderer.error((error as Error).message);
      }
      continue;
    }

    busy = true;
    currentAgent = runtime.agent;
    try {
      const result = await runtime.agent.run(text);
      renderer.flush();
      if (runtime.config.ui.showCost) renderer.status(renderer.costLine());
      if (result.stoppedReason === "budget") renderer.warn("stopped: cost limit reached");
      else if (result.stoppedReason === "max_turns") renderer.warn("stopped: max turns reached");
      else if (result.stoppedReason === "aborted") renderer.warn("stopped: aborted");
      else if (result.stoppedReason === "error") renderer.error("stopped: provider/agent error");
    } catch (error) {
      renderer.flush();
      renderer.error((error as Error).message);
    } finally {
      busy = false;
    }
  }

  runtime.close();
}
