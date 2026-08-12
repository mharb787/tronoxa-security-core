import type { JsonRpcTransport } from '@tronoxa/bsc-core';
import { fetchWithDeviceSession } from '../lib/api';

const ALLOWED_METHODS = new Set([
  'eth_chainId',
  'eth_blockNumber',
  'eth_getBalance',
  'eth_getTransactionCount',
  'eth_gasPrice',
  'eth_maxPriorityFeePerGas',
  'eth_estimateGas',
  'eth_call',
  'eth_getTransactionReceipt',
  'eth_getTransactionByHash',
  'eth_sendRawTransaction',
  'nr_getTransactionByAddress',
]);
const ALLOWED_HISTORY_PAGE_SIZES = new Set(['0x1e', '0x64']);

type AuthenticatedFetch = (url: string, init: RequestInit) => Promise<Response>;

export function resolveBscRelayUrl(
  apiBaseUrl = process.env.EXPO_PUBLIC_API_URL ?? 'https://api.tronoxa.com/api/v1',
): string {
  const parsed = new URL(apiBaseUrl);
  const local = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  if (parsed.protocol !== 'https:' && !local) throw new Error('bsc_relay_https_required');
  if (parsed.username || parsed.password) throw new Error('bsc_relay_embedded_credentials_rejected');
  parsed.search = '';
  parsed.hash = '';
  parsed.pathname = `${parsed.pathname.replace(/\/+$/, '')}/bsc-rpc`;
  return parsed.toString();
}

export class TronoxaBscRelayTransport implements JsonRpcTransport {
  readonly name = 'tronoxa-authenticated-mainnet-relay';
  readonly #url: string;
  readonly #fetcher: AuthenticatedFetch;
  #requestId = 0;

  constructor(
    apiBaseUrl?: string,
    fetcher: AuthenticatedFetch = fetchWithDeviceSession,
  ) {
    this.#url = resolveBscRelayUrl(apiBaseUrl);
    this.#fetcher = fetcher;
  }

  async request(
    method: string,
    params: readonly unknown[],
    signal?: AbortSignal,
  ): Promise<unknown> {
    if (!ALLOWED_METHODS.has(method)) throw new Error('bsc_relay_method_not_allowed');
    validateSensitiveRequest(method, params);
    const id = ++this.#requestId;
    let response: Response;
    try {
      response = await this.#fetcher(this.#url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
        ...(signal ? { signal } : {}),
      });
    } catch {
      throw new Error('bsc_relay_unavailable');
    }
    if (!response.ok) throw new Error('bsc_relay_unavailable');
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new Error('bsc_relay_response_invalid');
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new Error('bsc_relay_response_invalid');
    }
    const envelope = payload as Record<string, unknown>;
    if (
      envelope.jsonrpc !== '2.0'
      || envelope.id !== id
      || envelope.error
      || !Object.prototype.hasOwnProperty.call(envelope, 'result')
    ) throw new Error('bsc_relay_response_invalid');
    return envelope.result;
  }
}

function validateSensitiveRequest(method: string, params: readonly unknown[]): void {
  if (method === 'eth_sendRawTransaction') {
    if (
      params.length !== 1
      || typeof params[0] !== 'string'
      || !/^0x[0-9a-fA-F]+$/.test(params[0])
      || params[0].length > 300_002
    ) throw new Error('bsc_relay_params_invalid');
    return;
  }
  if (method !== 'nr_getTransactionByAddress') return;
  if (params.length !== 1 || !params[0] || typeof params[0] !== 'object' || Array.isArray(params[0])) {
    throw new Error('bsc_relay_params_invalid');
  }
  const query = params[0] as Record<string, unknown>;
  if (
    !Array.isArray(query.category)
    || query.category.length < 1
    || query.category.some((value) => value !== 'external' && value !== '20')
    || query.addressType !== null
    || typeof query.address !== 'string'
    || !/^0x[0-9a-fA-F]{40}$/.test(query.address)
    || query.order !== 'desc'
    || typeof query.maxCount !== 'string'
    || !ALLOWED_HISTORY_PAGE_SIZES.has(query.maxCount)
  ) throw new Error('bsc_relay_params_invalid');
}
