# TRONOXA Security Core

This public repository is a **source-available security transparency snapshot** of selected TRONOXA wallet components. It lets reviewers inspect how wallet secrets are derived, encrypted, unlocked, used for local transaction signing, and protected before broadcast.

It is **not the TRONOXA application**, is not a buildable copy of the product, and is not currently imported by the production app.

## Included scope

- BIP39 mnemonic and TRON address/key derivation.
- AES-256-GCM wallet-vault encryption.
- Separation between encrypted vault data and the OS secure key store.
- Local PIN protection and authenticated secret access.
- Local TRX/TRC20 transaction construction, signing, and broadcast checks.
- Signed-transaction recovery validation.
- Imported transaction integrity and multisig permission validation.
- Focused security smoke tests.

## Deliberately excluded

User interfaces, navigation, backend services, application APIs, analytics, pricing, asset discovery, swap routing, energy providers, product configuration, deployment files, credentials, branding assets, and unrelated business logic are not published here.

The signing module is a curated extraction: security-relevant signing and broadcast blocks are retained, while balance, pricing, swap, provider, and UI helpers are omitted.

## Secret-safety statement

This repository contains no production private keys, mnemonics, API keys, tokens, credentials, user records, environment files, service-account files, or application signing certificates. Test addresses and keys are deterministic public fixtures and must never receive funds.

## Verification

```bash
npm install --ignore-scripts
npm test
```

## License

This software is **Source Available**, not Open Source. It is licensed under the [PolyForm Shield License 1.0.0](LICENSE), including the required notice and protected line of business in [NOTICE](NOTICE).
