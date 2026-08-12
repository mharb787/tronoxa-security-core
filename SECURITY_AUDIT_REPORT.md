# Security Audit Report

> Evidence template and automated baseline — not an independent professional audit.

## Report metadata

| Field | Value |
| --- | --- |
| Project | TRONOXA Security Core |
| Scope | Published TRON and BSC/BEP-20 security code |
| Source commit | Filled automatically for a tagged report |
| Assessment date | Filled automatically |
| Assessor | GitHub Actions / named reviewer |
| Method | Build, tests, provenance verification, dependency audit, CodeQL and MobSFscan |

## Executive summary

At the time this template was prepared, local build, security smoke tests, BSC provenance verification and `npm audit` completed successfully, with **zero known high or critical dependency vulnerabilities in this public package lockfile**. This statement is deliberately limited to the tools, code and dependency graph listed here. It is not a guarantee that the wallet has zero vulnerabilities.

A release report may state “zero high-risk findings detected” only when its attached CI artifacts show zero open high/critical findings for the exact commit.

## Automated results

| Control | Result | Evidence |
| --- | --- | --- |
| TypeScript production build | Pass | CI job / build log |
| TRON transaction-substitution and multisig tests | Pass | `npm run test:signing` |
| Vault encryption/tamper/reinstall tests | Pass | `npm run test:vault` |
| BSC source/package provenance | Pass | `npm run verify:provenance` |
| Dependency audit | 0 high, 0 critical at template baseline | `npm audit --json` |
| CodeQL JavaScript/TypeScript | Pending CI artifact | GitHub code scanning |
| MobSFscan | Pending CI artifact | `mobsfscan.sarif` |
| Secret-pattern scan | Pending CI artifact | workflow log |
| Independent manual audit | Not performed | No claim made |

## Key-management review

- BIP-39 recovery material is created/validated client-side.
- TRON and BSC use explicit, chain-specific BIP-44 paths.
- The vault uses authenticated AES-256-GCM encryption with separate key/ciphertext storage boundaries.
- Private keys and phrases are not backend or RPC inputs.
- BSC signing is callback-scoped and binds the signer address to the expected wallet.
- Signed BSC transaction fields and locally derived hash are checked before/after broadcast.
- Mutable private-key byte buffers are overwritten when practical; JavaScript memory erasure remains a documented limitation.

## BEP-20 controls reviewed

- Chain ID restricted and verified against RPC.
- RPC method allowlist and HTTPS-only transport.
- Fixed code-reviewed token contract metadata.
- Exact ERC-20 transfer selector; no arbitrary approvals or calls.
- Integer base units and decimal precision enforcement.
- Recipient, amount, nonce, gas, fee and calldata verified after signing.
- Quote expiry/tamper binding and per-account nonce coordination.
- Unknown broadcast outcome retained for recovery rather than blind replay.

## Findings

| ID | Severity | Component | Description | Status |
| --- | --- | --- | --- | --- |
| — | — | — | No findings may be entered until supported by attached evidence | — |

## Residual risk

Automated SAST can miss design flaws, dependency behavior, native-platform weaknesses, malicious build infrastructure and device compromise. RPC availability and correctness, JavaScript memory retention, phishing, unsafe recovery-phrase handling, rooted devices and store-signing custody require operational controls beyond this repository.

## Approval

A release owner must replace all “Pending” fields, link immutable artifacts, record accepted residual risks and sign the report for the exact tag. Do not remove this disclaimer or market this template as a paid/independent audit.
