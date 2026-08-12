# Threat model

## Assets

- Mnemonics and private keys supplied transiently by the Tronoxa vault.
- User-confirmed chain, sender, recipient, asset, amount, nonce, calldata, and maximum fee.
- Signed raw transactions and transaction hashes.
- Fixed chain and token configuration.

## Trust boundaries

- The mobile vault and authorization UI are outside this package.
- RPC and history providers are untrusted network inputs.
- The Tronoxa backend receives public addresses and transaction hashes only; it is never a signer.
- Remote configuration may disable capability but cannot replace chain IDs, derivation paths, token contracts, recipients, amounts, or calldata after confirmation.

## Attacker capabilities

- Return malformed, stale, inconsistent, or wrong-chain RPC responses.
- Race concurrent sends, replay UI actions, interrupt transport, or trigger application restarts.
- Supply lookalike addresses, invalid mixed-case checksums, malformed amounts, QR payloads, or fake token contracts.
- Observe logs, analytics, crash reports, or persisted state if callers accidentally include secrets.

## Mitigations

- Closed network allowlist and mandatory RPC chain-ID verification.
- Closed token allowlist and exact transfer selector binding.
- Integer-only amount handling and bounded fee/gas policies.
- Per-account nonce coordination and signed-transaction field verification before broadcast.
- Idempotent broadcast recovery based on the locally derived transaction hash.
- No secret persistence, logging, analytics, or server transport.
- Feature flags default off and removable adapter-based application integration.

## Residual risks

- JavaScript does not guarantee secure memory erasure.
- RPC availability and correctness require multiple providers and validation.
- Complete native BNB history requires an approved indexer; standard log polling is insufficient.
- Reusing an imported private key across TRON and BSC increases cross-chain compromise impact.
- Mainnet energy payment remains unsafe until custody, reconciliation, finality, failure, and refund policies are approved and tested.

