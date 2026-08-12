export declare class NonceCoordinator {
    #private;
    constructor(maxQueueDepth?: number);
    runExclusive<T>(address: string, operation: () => Promise<T>): Promise<T>;
}
//# sourceMappingURL=nonce-coordinator.d.ts.map
