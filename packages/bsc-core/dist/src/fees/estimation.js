import { toChecksumAddress } from '../addresses/bsc-address.js';
import { BscError } from '../errors/bsc-error.js';
import { applyGasSafetyMargin, encodeTokenTransfer } from '../transactions/prepare.js';
function enforceGuard(estimate, guard) {
    if (guard.maximumGasPriceWei !== undefined && estimate.gasPrice > guard.maximumGasPriceWei) {
        throw new BscError('FEE_LIMIT_EXCEEDED', 'Gas price exceeds the configured maximum');
    }
    if (guard.maximumFeeWei !== undefined && estimate.maximumFee > guard.maximumFeeWei) {
        throw new BscError('FEE_LIMIT_EXCEEDED', 'Maximum fee exceeds the configured maximum');
    }
    return estimate;
}
async function estimate(client, transaction, guard) {
    const [estimatedGas, gasPrice] = await Promise.all([
        client.estimateGas(transaction),
        client.getGasPrice(),
    ]);
    const gasLimit = applyGasSafetyMargin(estimatedGas, guard.gasMarginBps ?? 2_000);
    return enforceGuard(Object.freeze({
        estimatedGas,
        gasLimit,
        gasPrice,
        maximumFee: gasLimit * gasPrice,
    }), guard);
}
export function estimateBnbTransfer(client, request, guard = {}) {
    if (request.value <= 0n)
        throw new BscError('INVALID_AMOUNT', 'BNB amount must be greater than zero');
    return estimate(client, {
        from: toChecksumAddress(request.from),
        to: toChecksumAddress(request.to),
        value: request.value,
        data: '0x',
    }, guard);
}
export async function estimateTokenTransfer(client, request, guard = {}) {
    if (request.token.chainId !== client.chainId)
        throw new BscError('UNSUPPORTED_CHAIN', 'Token chain does not match RPC chain');
    const transaction = {
        from: toChecksumAddress(request.from),
        to: request.token.address,
        value: 0n,
        data: encodeTokenTransfer(request.recipient, request.amount),
    };
    await client.simulateCall(transaction);
    return estimate(client, transaction, guard);
}
export function calculateMaxBnbSend(balance, fee) {
    if (balance <= fee.maximumFee) {
        throw new BscError('INSUFFICIENT_BNB', 'BNB balance cannot cover the maximum fee');
    }
    return balance - fee.maximumFee;
}
//# sourceMappingURL=estimation.js.map