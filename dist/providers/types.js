"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProviderError = void 0;
class ProviderError extends Error {
    status;
    retryable;
    constructor(message, status, retryable = false) {
        super(message);
        this.status = status;
        this.retryable = retryable;
        this.name = "ProviderError";
    }
}
exports.ProviderError = ProviderError;
//# sourceMappingURL=types.js.map