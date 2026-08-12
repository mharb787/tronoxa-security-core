export interface JsonRpcTransport {
    readonly name: string;
    request(method: string, params: readonly unknown[], signal?: AbortSignal): Promise<unknown>;
}
export declare class FetchJsonRpcTransport implements JsonRpcTransport {
    #private;
    readonly name: string;
    constructor(name: string, url: string);
    request(method: string, params: readonly unknown[], signal?: AbortSignal): Promise<unknown>;
}
//# sourceMappingURL=transport.d.ts.map