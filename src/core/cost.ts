import type { ChatUsage } from "../providers/types";
import type { ResolvedModel } from "../config/types";

export interface CostSummary {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  turns: number;
}

/** What one usage event costs. The single place that knows the formula. */
export function costOf(usage: ChatUsage, model: ResolvedModel): number {
  let cost =
    (usage.inputTokens / 1_000_000) * model.inputPricePerMTok +
    (usage.outputTokens / 1_000_000) * model.outputPricePerMTok;
  if (usage.reasoningTokens) {
    cost += (usage.reasoningTokens / 1_000_000) * model.outputPricePerMTok;
  }
  return cost;
}

export class CostTracker {
  inputTokens = 0;
  outputTokens = 0;
  costUsd = 0;
  turns = 0;

  constructor(readonly limitUsd = Number.POSITIVE_INFINITY) {}

  add(usage: ChatUsage, model: ResolvedModel): void {
    this.inputTokens += usage.inputTokens;
    this.outputTokens += usage.outputTokens;
    this.costUsd += costOf(usage, model);
  }

  nextTurn(): void {
    this.turns += 1;
  }

  exceeded(): boolean {
    return this.costUsd >= this.limitUsd;
  }

  summary(): CostSummary {
    return {
      inputTokens: this.inputTokens,
      outputTokens: this.outputTokens,
      totalTokens: this.inputTokens + this.outputTokens,
      costUsd: this.costUsd,
      turns: this.turns,
    };
  }
}
