import { BscError } from '../errors/bsc-error.js';
export class FetchJsonRpcTransport {
    name;
    #url;
    #requestId = 0;
    constructor(name, url) {
        const parsed = new URL(url);
        if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
            throw new BscError('RPC_UNAVAILABLE', 'RPC URL must use HTTPS outside localhost');
        }
        if (parsed.username || parsed.password) {
            throw new BscError('RPC_UNAVAILABLE', 'RPC URL must not contain embedded credentials');
        }
        this.name = name;
        this.#url = parsed.toString();
    }
    async request(method, params, signal) {
        const id = ++this.#requestId;
        const response = await fetch(this.#url, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
            ...(signal ? { signal } : {}),
        });
        if (!response.ok)
            throw new BscError('RPC_UNAVAILABLE', `RPC HTTP status ${response.status}`);
        const payload = await response.json();
        if (payload.id !== id || payload.error || !Object.hasOwn(payload, 'result')) {
            throw new BscError('RPC_MALFORMED_RESPONSE', 'RPC returned an invalid JSON-RPC envelope');
        }
        return payload.result;
    }
}
//# sourceMappingURL=transport.js.map
