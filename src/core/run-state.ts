/**
 * The run state machine.
 *
 * The agent is not a loop that can be in any state at any time: it runs, it
 * waits for a confirmation, it pauses, it finishes, it gets stuck. Making those
 * states explicit means the UI can show what the agent is doing, a crash can
 * be resumed, and an illegal transition can be refused instead of quietly
 * corrupting the loop.
 *
 * One funnel writes the state. Everything else asks it to transition.
 */

export type RunState =
  | "idle"
  | "running"
  | "awaiting_confirmation"
  | "paused"
  | "stopped"
  | "finished"
  | "error"
  | "stuck";

/** The legal transitions. Anything not listed here is refused. */
export const RUN_TRANSITIONS: Record<RunState, readonly RunState[]> = {
  idle: ["running"],
  running: ["awaiting_confirmation", "paused", "stopped", "finished", "error", "stuck"],
  awaiting_confirmation: ["running", "paused", "stopped", "error"],
  paused: ["running", "stopped", "error"],
  stopped: ["idle"],
  finished: ["idle"],
  error: ["idle", "running"],
  stuck: ["idle", "running"],
};

export interface StateTransition {
  readonly seq: number;
  readonly ts: string;
  readonly from: RunState;
  readonly to: RunState;
  readonly reason?: string;
}

export interface StateChange {
  readonly ok: boolean;
  readonly from: RunState;
  readonly to: RunState;
  /** why the transition was refused */
  readonly rejection?: string;
  /** the recorded transition (absent for a no-op) */
  readonly transition?: StateTransition;
}

export class RunStateMachine {
  private state: RunState = "idle";
  private seq = 0;
  private readonly history: StateTransition[] = [];

  constructor(private readonly onChange: (change: StateChange) => void = () => undefined) {}

  get current(): RunState {
    return this.state;
  }

  /** Every transition that actually happened. */
  get transitions(): StateTransition[] {
    return [...this.history];
  }

  canTransition(to: RunState): boolean {
    return RUN_TRANSITIONS[this.state].includes(to);
  }

  /**
   * The single mutation funnel.
   *
   * - a transition to the current state is a no-op (no event, no history entry)
   * - an illegal transition is refused and reported, never applied
   */
  transition(to: RunState, reason?: string): StateChange {
    if (to === this.state) {
      const change: StateChange = { ok: true, from: this.state, to };
      this.onChange(change);
      return change;
    }
    if (!this.canTransition(to)) {
      const change: StateChange = {
        ok: false,
        from: this.state,
        to,
        rejection: `illegal transition ${this.state} -> ${to}`,
      };
      this.onChange(change);
      return change;
    }
    const transition: StateTransition = {
      seq: ++this.seq,
      ts: new Date().toISOString(),
      from: this.state,
      to,
      reason,
    };
    this.state = to;
    this.history.push(transition);
    const change: StateChange = { ok: true, from: transition.from, to, transition };
    this.onChange(change);
    return change;
  }

  /**
   * Start a new turn.
   *
   * The machine lives for the whole session, but a turn ends in `finished` —
   * so the next turn needs `finished → idle → running`. Without this the
   * second message of a session was refused and the state lied.
   */
  startTurn(reason?: string): StateChange {
    if (this.state === "finished" || this.state === "stopped" || this.state === "error" || this.state === "stuck") {
      this.transition("idle", "new turn");
    }
    return this.transition("running", reason);
  }

  /** Is the agent allowed to take a step right now? */
  canStep(): boolean {
    return this.state === "running";
  }

  reset(): void {
    this.state = "idle";
  }
}
