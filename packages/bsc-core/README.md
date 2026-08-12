# tronoxa-bsc-core

Private, separately maintained TypeScript core for adding BNB Smart Chain support to Tronoxa. The package is intentionally UI-, storage-, analytics-, and server-agnostic so it can be integrated or removed without changing existing TRON behavior.

## Current scope

- BNB Smart Chain Mainnet (chain ID 56) and Testnet (chain ID 97).
- Native BNB with 18 decimals.
- A fixed Mainnet allowlist entry for Binance-Peg BSC-USD (USDT display symbol) at `0x55d398326f99059fF775485246999027B3197955`, with 18 decimals.
- BIP-39/BIP-44 BSC address derivation at `m/44'/60'/0'/0/index`.
- Raw secp256k1 private-key address derivation without persistence.
- EIP-55 validation and validated TRON Base58Check watch-address conversion.
- Strict integer-only amount parsing and formatting.

RPC, fee, transaction preparation, signing, broadcast, and receipt tracking are being added as separately testable modules before application integration.

## Security model

The package never stores wallet secrets and never sends them to a server or provider. Callers supply signing material only through a short-lived signer interface. JavaScript runtimes cannot guarantee secure memory erasure, so callers must minimize secret lifetime and avoid immutable string copies where practical.

Mainnet send, notification, and energy-payment paths remain disabled in Tronoxa until their independent release gates are approved.

## Integration and rollback

Tronoxa integrates this package through one adapter behind disabled-by-default feature flags. BSC uses separate configuration and persistence keys. Removing the adapter, routes, and exact package dependency restores the pre-BSC application graph; no TRON wallet metadata, derivation path, encrypted secret, transaction, or notification behavior is rewritten.

During development, consume an exact Git commit. Floating branches and `latest` are not supported.

## Test credentials

Tests use only published vectors with no funds. Never use a production mnemonic or private key in tests, fixtures, logs, screenshots, or issue reports.

Run:

```sh
npm ci
npm run typecheck
npm test
npm run audit
npm run test:testnet:read
```

The Testnet read integration test uses only BNB Chain's documented public endpoints and a public zero address. It never signs or broadcasts.

## Non-scope

No arbitrary tokens, approvals, contract calls, swaps, staking, DApps, WalletConnect, bridges, NFTs, remote signing, seed storage, or production feature activation.
