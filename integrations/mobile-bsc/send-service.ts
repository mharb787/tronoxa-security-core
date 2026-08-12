import type {
  BscReadClient,
  BscToken,
  FeeEstimate,
  PreparedTransaction,
  TransactionSigner,
} from '@tronoxa/bsc-core';
import type { TronoxaBscCore } from './adapter';
import { BSC_FEATURE_FLAGS, type BscFeatureFlags } from './feature-flags';
import {
  listStoredBscTransactions,
  storePendingBscTransaction,
  updateStoredBscTransaction,
  type StoredBscTransaction,
} from './pending-transactions';

const QUOTE_LIFETIME_MS = 120_000;
const MAX_REMEMBERED_QUOTES = 256;
const DEFAULT_MAXIMUM_FEE_WEI = 10_000_000_000_000_000n;
const DEFAULT_MAXIMUM_GAS_PRICE_WEI = 20_000_000_000n;
const REPLACEMENT_GAS_BUMP_BPS = 12_000n;
const CANCEL_GAS_LIMIT = 21_000n;

export type BscSendAsset =
  | Readonly<{ kind: 'BNB' }>
  | Readonly<{ kind: 'USDT_BEP20'; token: BscToken }>;

export type BscSendQuote = Readonly<{
  id: string;
  chainId: 56 | 97;
  walletId: string;
  asset: BscSendAsset;
  from: string;
  recipient: string;
  amountBaseUnits: bigint;
  nonce: number;
  fee: FeeEstimate;
  createdAtMs: number;
}>;

export type WithAuthorizedBscSigner = <T>(
  expectedAddress: string,
  operation: (signer: TransactionSigner) => Promise<T>,
) => Promise<T>;

export type BscSendContext = Readonly<{ energyOrderId?: string }>;

export type ReplacePendingBscRequest = Readonly<{
  walletId: string;
  hash: string;
  mode: 'speed-up' | 'cancel';
}>;

export type BscSendServiceConfig = Readonly<{
  core: TronoxaBscCore;
  client: BscReadClient;
  /** Code-reviewed token configuration; never supplied by UI or remote data. */
  usdtToken?: BscToken;
  flags?: BscFeatureFlags;
  maximumFeeWei?: bigint;
  maximumGasPriceWei?: bigint;
  now?: () => number;
}>;

export type PrepareBscSendRequest = Readonly<{
  walletId: string;
  from: string;
  recipient: string;
  amount: string;
  asset: 'BNB' | 'USDT_BEP20';
}>;

export function createBscSendService(config: BscSendServiceConfig) {
  const flags = config.flags ?? BSC_FEATURE_FLAGS;
  const now = config.now ?? Date.now;
  const feeGuard = Object.freeze({
    maximumFeeWei: config.maximumFeeWei ?? DEFAULT_MAXIMUM_FEE_WEI,
    maximumGasPriceWei: config.maximumGasPriceWei ?? DEFAULT_MAXIMUM_GAS_PRICE_WEI,
  });
  const nonceCoordinator = new config.core.NonceCoordinator();
  const inFlight = new Map<string, Promise<StoredBscTransaction>>();
  const completed = new Map<string, StoredBscTransaction>();
  const consumed = new Set<string>();
  const replacements = new Map<string, Promise<StoredBscTransaction>>();

  async function prepareQuote(request: PrepareBscSendRequest): Promise<BscSendQuote> {
    assertSendEnabled(flags, config.client.chainId);
    const asset = resolveAsset(request.asset);
    const from = config.core.toChecksumAddress(request.from);
    const recipient = config.core.toChecksumAddress(request.recipient);
    if (!request.walletId.trim()) throw new Error('bsc_wallet_id_required');
    if (from === recipient) throw new Error('bsc_self_send_not_allowed');
    const amountBaseUnits = asset.kind === 'BNB'
      ? config.core.parseBnb(request.amount)
      : config.core.parseBscUsdt(request.amount);
    const [nonce, fee, balances] = await Promise.all([
      config.client.getPendingNonce(from),
      estimateFee(asset, from, recipient, amountBaseUnits),
      readBalances(asset, from),
    ]);
    const prepared = prepareTransaction(asset, from, recipient, amountBaseUnits, nonce, fee);
    assertCurrentBalances(asset, prepared, balances, amountBaseUnits);
    const createdAtMs = now();
    const quoteFields = {
      chainId: config.client.chainId,
      walletId: request.walletId,
      asset,
      from,
      recipient,
      amountBaseUnits,
      nonce,
      fee,
      createdAtMs,
    } as const;
    return Object.freeze({
      id: quoteId(quoteFields),
      ...quoteFields,
    });
  }

  async function executeConfirmedQuote(
    quote: BscSendQuote,
    withAuthorizedSigner: WithAuthorizedBscSigner,
    context: BscSendContext = {},
  ): Promise<StoredBscTransaction> {
    assertSendEnabled(flags, config.client.chainId);
    if (context.energyOrderId !== undefined
      && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(context.energyOrderId)) {
      throw new Error('bsc_energy_order_id_invalid');
    }
    validateQuote(quote, now());
    const finished = completed.get(quote.id);
    if (finished) return finished;
    const active = inFlight.get(quote.id);
    if (active) return active;
    if (consumed.has(quote.id)) throw new Error('bsc_send_quote_consumed');

    const operation = nonceCoordinator.runExclusive(quote.from, async () => {
      validateQuote(quote, now());
      const [pendingNonce, currentFee, balances] = await Promise.all([
        config.client.getPendingNonce(quote.from),
        estimateFee(quote.asset, quote.from, quote.recipient, quote.amountBaseUnits),
        readBalances(quote.asset, quote.from),
      ]);
      if (pendingNonce !== quote.nonce) throw new Error('bsc_nonce_changed_requote_required');
      if (currentFee.maximumFee > quote.fee.maximumFee) throw new Error('bsc_fee_changed_requote_required');
      const prepared = prepareTransaction(
        quote.asset,
        quote.from,
        quote.recipient,
        quote.amountBaseUnits,
        pendingNonce,
        currentFee,
      );
      assertCurrentBalances(quote.asset, prepared, balances, quote.amountBaseUnits);

      let rawTransaction = '';
      try {
        rawTransaction = await withAuthorizedSigner(quote.from, (signer) => (
          config.core.signPreparedTransaction(prepared, signer)
        ));
        const decoded = config.core.decodeAndVerifySignedTransaction(rawTransaction, prepared);
        if (!decoded.hash) throw new Error('bsc_signed_transaction_hash_missing');
        rememberBounded(consumed, quote.id);
        const stored = await storePendingBscTransaction({
          hash: decoded.hash,
          chainId: quote.chainId,
          walletId: quote.walletId,
          asset: quote.asset.kind,
          from: quote.from,
          to: quote.recipient,
          amountBaseUnits: quote.amountBaseUnits.toString(),
          maximumFeeWei: currentFee.maximumFee.toString(),
          gasLimit: currentFee.gasLimit.toString(),
          gasPriceWei: currentFee.gasPrice.toString(),
          nonce: quote.nonce,
          energyOrderId: context.energyOrderId,
        });
        try {
          const broadcastHash = await config.client.broadcastSignedTransaction(rawTransaction);
          if (broadcastHash.toLowerCase() !== stored.hash.toLowerCase()) {
            throw new Error('bsc_broadcast_hash_mismatch');
          }
        } catch {
          // The hash is known but the network outcome is uncertain. Keep the
          // record pending so restart tracking can recover without rebroadcast.
          throw new Error('bsc_broadcast_status_unknown');
        }
        rememberBounded(completed, quote.id, stored);
        return stored;
      } finally {
        // JavaScript strings cannot be zeroed, but dropping the last local
        // reference promptly avoids retaining signed bytes in this service.
        rawTransaction = '';
      }
    });
    inFlight.set(quote.id, operation);
    try {
      return await operation;
    } finally {
      inFlight.delete(quote.id);
    }
  }

  async function replacePendingTransaction(
    request: ReplacePendingBscRequest,
    withAuthorizedSigner: WithAuthorizedBscSigner,
  ): Promise<StoredBscTransaction> {
    assertSendEnabled(flags, config.client.chainId);
    const key = request.hash.trim().toLowerCase();
    if (!/^0x[0-9a-f]{64}$/.test(key)) throw new Error('bsc_replacement_hash_invalid');
    if (!request.walletId.trim()) throw new Error('bsc_wallet_id_required');
    const active = replacements.get(key);
    if (active) return active;

    const operation = (async () => {
      const transactions = await listStoredBscTransactions(request.walletId);
      const original = transactions.find((item) => item.hash.toLowerCase() === key);
      if (!original || original.status !== 'pending') throw new Error('bsc_replacement_not_pending');
      if (original.chainId !== config.client.chainId) throw new Error('bsc_replacement_wrong_chain');
      if (transactions.some((item) => (
        item.hash.toLowerCase() !== key
        && item.status === 'pending'
        && item.chainId === original.chainId
        && item.from.toLowerCase() === original.from.toLowerCase()
        && item.nonce === original.nonce
      ))) throw new Error('bsc_replacement_already_pending');

      return nonceCoordinator.runExclusive(original.from, async () => {
        const asset = resolveAsset(original.asset);
        const from = config.core.toChecksumAddress(original.from);
        const recipient = config.core.toChecksumAddress(original.to);
        const amount = BigInt(original.amountBaseUnits);
        const previousFee = await loadOriginalFee(original, asset, from, recipient, amount);
        const networkGasPrice = await config.client.getGasPrice();
        const bumpedGasPrice = ceilDivide(previousFee.gasPrice * REPLACEMENT_GAS_BUMP_BPS, 10_000n);
        const gasPrice = networkGasPrice > bumpedGasPrice ? networkGasPrice : bumpedGasPrice;
        const gasLimit = request.mode === 'cancel' ? CANCEL_GAS_LIMIT : previousFee.gasLimit;
        const fee = replacementFee(gasLimit, gasPrice);
        if (fee.gasPrice > feeGuard.maximumGasPriceWei) throw new Error('bsc_gas_price_limit_exceeded');
        if (fee.maximumFee > feeGuard.maximumFeeWei) throw new Error('bsc_fee_limit_exceeded');

        const replacementAsset: BscSendAsset = request.mode === 'cancel'
          ? Object.freeze({ kind: 'BNB' as const })
          : asset;
        const replacementRecipient = request.mode === 'cancel' ? from : recipient;
        const replacementAmount = request.mode === 'cancel' ? 0n : amount;
        const prepared: PreparedTransaction = request.mode === 'cancel'
          ? Object.freeze({
              chainId: config.client.chainId,
              from,
              to: from,
              value: 0n,
              data: '0x',
              nonce: original.nonce,
              gasLimit: fee.gasLimit,
              fee: { type: 'legacy' as const, gasPrice: fee.gasPrice },
            })
          : prepareTransaction(
              replacementAsset,
              from,
              replacementRecipient,
              replacementAmount,
              original.nonce,
              fee,
            );
        const balances = await readBalances(replacementAsset, from);
        assertCurrentBalances(replacementAsset, prepared, balances, replacementAmount);

        let rawTransaction = '';
        try {
          rawTransaction = await withAuthorizedSigner(from, (signer) => (
            config.core.signPreparedTransaction(prepared, signer)
          ));
          const decoded = config.core.decodeAndVerifySignedTransaction(rawTransaction, prepared);
          if (!decoded.hash) throw new Error('bsc_signed_transaction_hash_missing');
          const stored = await storePendingBscTransaction({
            hash: decoded.hash,
            chainId: original.chainId,
            walletId: original.walletId,
            asset: replacementAsset.kind,
            from,
            to: replacementRecipient,
            amountBaseUnits: replacementAmount.toString(),
            maximumFeeWei: fee.maximumFee.toString(),
            gasLimit: fee.gasLimit.toString(),
            gasPriceWei: fee.gasPrice.toString(),
            nonce: original.nonce,
            ...(request.mode === 'speed-up' && original.energyOrderId
              ? { energyOrderId: original.energyOrderId }
              : {}),
          });
          try {
            const broadcastHash = await config.client.broadcastSignedTransaction(rawTransaction);
            if (broadcastHash.toLowerCase() !== stored.hash.toLowerCase()) {
              throw new Error('bsc_broadcast_hash_mismatch');
            }
          } catch {
            throw new Error('bsc_broadcast_status_unknown');
          }
          await updateStoredBscTransaction(original.hash, {
            status: 'replaced',
            replacementHash: stored.hash,
          }).catch(() => undefined);
          return stored;
        } finally {
          rawTransaction = '';
        }
      });
    })();
    replacements.set(key, operation);
    try {
      return await operation;
    } finally {
      replacements.delete(key);
    }
  }

  async function resumePending(walletId?: string): Promise<void> {
    assertBscEnabled(flags);
    const transactions = await listStoredBscTransactions(walletId);
    for (const transaction of transactions) {
      if (transaction.status !== 'pending' || transaction.chainId !== config.client.chainId) continue;
      try {
        const receipt = await config.client.waitForTransactionReceipt(transaction.hash);
        await updateStoredBscTransaction(transaction.hash, {
          status: 'confirmed',
          blockNumber: receipt.blockNumber.toString(),
        });
      } catch (error) {
        if (error instanceof config.core.BscError && error.code === 'TRANSACTION_REVERTED') {
          await updateStoredBscTransaction(transaction.hash, {
            status: 'failed',
            failureCode: 'TRANSACTION_REVERTED',
          });
        }
        // Timeouts and temporary RPC failures remain pending for the next
        // foreground/restart pass; they are never guessed to be dropped.
      }
    }
  }

  async function estimateFee(
    asset: BscSendAsset,
    from: string,
    recipient: string,
    amount: bigint,
  ): Promise<FeeEstimate> {
    return asset.kind === 'BNB'
      ? config.core.estimateBnbTransfer(config.client, { from, to: recipient, value: amount }, feeGuard)
      : config.core.estimateTokenTransfer(config.client, {
          from,
          recipient,
          token: asset.token,
          amount,
        }, feeGuard);
  }

  async function readBalances(asset: BscSendAsset, from: string): Promise<Readonly<{
    bnb: bigint;
    token?: bigint;
  }>> {
    if (asset.kind === 'BNB') return { bnb: await config.client.getBnbBalance(from) };
    const [bnb, token] = await Promise.all([
      config.client.getBnbBalance(from),
      config.client.getTokenBalance(from, asset.token),
    ]);
    return { bnb, token };
  }

  function prepareTransaction(
    asset: BscSendAsset,
    from: string,
    recipient: string,
    amount: bigint,
    nonce: number,
    fee: FeeEstimate,
  ): PreparedTransaction {
    const common = {
      chainId: config.client.chainId,
      from,
      nonce,
      gasLimit: fee.gasLimit,
      fee: { type: 'legacy' as const, gasPrice: fee.gasPrice },
    };
    return asset.kind === 'BNB'
      ? config.core.prepareBnbTransfer({ ...common, to: recipient, value: amount })
      : config.core.prepareTokenTransfer({ ...common, token: asset.token, recipient, amount });
  }

  function assertCurrentBalances(
    asset: BscSendAsset,
    prepared: PreparedTransaction,
    balances: Readonly<{ bnb: bigint; token?: bigint }>,
    amount: bigint,
  ): void {
    config.core.assertBalances({
      prepared,
      bnbBalance: balances.bnb,
      maximumAllowedFee: feeGuard.maximumFeeWei,
      ...(asset.kind === 'USDT_BEP20' ? { tokenBalance: balances.token, tokenAmount: amount } : {}),
    });
  }

  function validateQuote(quote: BscSendQuote, currentTimeMs: number): void {
    if (quote.chainId !== config.client.chainId) throw new Error('bsc_quote_wrong_chain');
    if (
      !Number.isSafeInteger(quote.createdAtMs)
      || currentTimeMs < quote.createdAtMs
      || currentTimeMs > quote.createdAtMs + QUOTE_LIFETIME_MS
    ) {
      throw new Error('bsc_quote_expired');
    }
    if (quote.id !== quoteId(quote)) throw new Error('bsc_quote_tampered');
    if (quote.asset.kind === 'USDT_BEP20') {
      const approved = config.usdtToken;
      if (
        !approved
        || quote.asset.token.chainId !== quote.chainId
        || quote.asset.token.chainId !== approved.chainId
        || quote.asset.token.address !== approved.address
        || quote.asset.token.decimals !== approved.decimals
        || quote.asset.token.transferSelector !== approved.transferSelector
      ) throw new Error('bsc_quote_unapproved_token');
    }
  }

  function resolveAsset(asset: PrepareBscSendRequest['asset']): BscSendAsset {
    if (asset === 'BNB') return Object.freeze({ kind: 'BNB' });
    const token = config.usdtToken;
    if (!token || token.chainId !== config.client.chainId) throw new Error('bsc_usdt_not_configured');
    return Object.freeze({ kind: 'USDT_BEP20', token });
  }

  async function loadOriginalFee(
    transaction: StoredBscTransaction,
    asset: BscSendAsset,
    from: string,
    recipient: string,
    amount: bigint,
  ): Promise<Readonly<{ gasLimit: bigint; gasPrice: bigint }>> {
    if (transaction.gasLimit && transaction.gasPriceWei) {
      return { gasLimit: BigInt(transaction.gasLimit), gasPrice: BigInt(transaction.gasPriceWei) };
    }
    const value = await config.client.request('eth_getTransactionByHash', [transaction.hash]);
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('bsc_replacement_transaction_unavailable');
    }
    const rpc = value as Record<string, unknown>;
    if (rpc.blockNumber !== null && rpc.blockNumber !== undefined) {
      throw new Error('bsc_replacement_already_confirmed');
    }
    const rpcFrom = config.core.toChecksumAddress(String(rpc.from ?? ''));
    const rpcTo = config.core.toChecksumAddress(String(rpc.to ?? ''));
    const rpcNonce = Number(config.core.parseRpcQuantity(rpc.nonce));
    const gasLimit = config.core.parseRpcQuantity(rpc.gas);
    const gasPrice = config.core.parseRpcQuantity(rpc.gasPrice);
    const expected = prepareTransaction(
      asset,
      from,
      recipient,
      amount,
      transaction.nonce,
      replacementFee(gasLimit, gasPrice),
    );
    const rpcValue = config.core.parseRpcQuantity(rpc.value);
    const rpcData = String(rpc.input ?? rpc.data ?? '').toLowerCase();
    if (
      rpcFrom !== from
      || rpcTo !== expected.to
      || rpcNonce !== transaction.nonce
      || rpcValue !== expected.value
      || rpcData !== expected.data.toLowerCase()
    ) throw new Error('bsc_replacement_transaction_mismatch');
    return { gasLimit, gasPrice };
  }

  return Object.freeze({ prepareQuote, executeConfirmedQuote, replacePendingTransaction, resumePending });
}

function replacementFee(gasLimit: bigint, gasPrice: bigint): FeeEstimate {
  if (gasLimit <= 0n || gasPrice <= 0n) throw new Error('bsc_replacement_fee_invalid');
  return Object.freeze({
    estimatedGas: gasLimit,
    gasLimit,
    gasPrice,
    maximumFee: gasLimit * gasPrice,
  });
}

function ceilDivide(value: bigint, divisor: bigint): bigint {
  return (value + divisor - 1n) / divisor;
}

function rememberBounded<T>(collection: Map<string, T>, key: string, value: T): void;
function rememberBounded(collection: Set<string>, key: string): void;
function rememberBounded<T>(collection: Map<string, T> | Set<string>, key: string, value?: T): void {
  if (collection instanceof Map) collection.set(key, value as T);
  else collection.add(key);
  while (collection.size > MAX_REMEMBERED_QUOTES) {
    const oldest = collection.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    collection.delete(oldest);
  }
}

function quoteId(quote: Omit<BscSendQuote, 'id'>): string {
  const token = quote.asset.kind === 'USDT_BEP20' ? quote.asset.token.address.toLowerCase() : '-';
  return [
    quote.chainId,
    quote.walletId,
    quote.from.toLowerCase(),
    quote.nonce,
    quote.asset.kind,
    token,
    quote.recipient.toLowerCase(),
    quote.amountBaseUnits,
    quote.fee.estimatedGas,
    quote.fee.gasLimit,
    quote.fee.gasPrice,
    quote.fee.maximumFee,
    quote.createdAtMs,
  ].join(':');
}

function assertBscEnabled(flags: BscFeatureFlags): void {
  if (!flags.enabled) throw new Error('bsc_feature_disabled');
}

function assertSendEnabled(flags: BscFeatureFlags, chainId: 56 | 97): void {
  assertBscEnabled(flags);
  if (!flags.sendEnabled) throw new Error('bsc_send_disabled');
  if (chainId === 56 && !flags.mainnetSendEnabled) throw new Error('bsc_mainnet_send_disabled');
}
