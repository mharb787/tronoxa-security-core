import { BscError } from '../errors/bsc-error.js';
export class NonceCoordinator {
    #tails = new Map();
    #depth = new Map();
    #maxQueueDepth;
    constructor(maxQueueDepth = 10) {
        if (!Number.isInteger(maxQueueDepth) || maxQueueDepth < 1 || maxQueueDepth > 100) {
            throw new RangeError('maxQueueDepth must be from 1 through 100');
        }
        this.#maxQueueDepth = maxQueueDepth;
    }
    async runExclusive(address, operation) {
        const key = address.toLowerCase();
        const depth = this.#depth.get(key) ?? 0;
        if (depth >= this.#maxQueueDepth)
            throw new BscError('NONCE_QUEUE_FULL', 'Per-account send queue is full');
        this.#depth.set(key, depth + 1);
        const previous = this.#tails.get(key) ?? Promise.resolve();
        let release;
        const current = new Promise((resolve) => { release = resolve; });
        const tail = previous.then(() => current);
        this.#tails.set(key, tail);
        await previous;
        try {
            return await operation();
        }
        finally {
            release();
            const nextDepth = (this.#depth.get(key) ?? 1) - 1;
            if (nextDepth === 0) {
                this.#depth.delete(key);
                if (this.#tails.get(key) === tail)
                    this.#tails.delete(key);
            }
            else {
                this.#depth.set(key, nextDepth);
            }
        }
    }
}
//# sourceMappingURL=nonce-coordinator.js.map
