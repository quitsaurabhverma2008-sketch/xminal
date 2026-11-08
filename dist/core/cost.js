"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CostTracker = void 0;
class CostTracker {
    limitUsd;
    inputTokens = 0;
    outputTokens = 0;
    costUsd = 0;
    turns = 0;
    constructor(limitUsd = Number.POSITIVE_INFINITY) {
        this.limitUsd = limitUsd;
    }
    add(usage, model) {
        this.inputTokens += usage.inputTokens;
        this.outputTokens += usage.outputTokens;
        this.costUsd +=
            (usage.inputTokens / 1_000_000) * model.inputPricePerMTok +
                (usage.outputTokens / 1_000_000) * model.outputPricePerMTok;
        if (usage.reasoningTokens) {
            this.costUsd += (usage.reasoningTokens / 1_000_000) * model.outputPricePerMTok;
        }
    }
    nextTurn() {
        this.turns += 1;
    }
    exceeded() {
        return this.costUsd >= this.limitUsd;
    }
    summary() {
        return {
            inputTokens: this.inputTokens,
            outputTokens: this.outputTokens,
            totalTokens: this.inputTokens + this.outputTokens,
            costUsd: this.costUsd,
            turns: this.turns,
        };
    }
}
exports.CostTracker = CostTracker;
//# sourceMappingURL=cost.js.map