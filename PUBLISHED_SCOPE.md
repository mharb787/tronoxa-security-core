# Published Scope Manifest

Snapshot source: TRONOXA production security code at commit `f09e85261e74486b78fddf07aec18279d4d9a349`.

| Public path | Review purpose | Fidelity |
| --- | --- | --- |
| `src/wallet/tron-keys.ts` | Mnemonic/private-key validation and derivation | Copied |
| `src/wallet/types.ts` | Security-relevant wallet secret types | Copied |
| `src/wallet/vault-codec.ts` | AES-256-GCM vault format and tamper detection | Copied |
| `src/wallet/storage.ts` | Encrypted vault and OS secure-store boundary | Copied |
| `src/security/app-security.ts` | PIN and local authentication storage | Copied |
| `src/security/transaction-validation.ts` | Imported transaction integrity and allowlisting | Copied |
| `src/signing/signed-transaction.ts` | Recoverable signed-transaction validation | Copied |
| `src/signing/tron-transactions.ts` | Local signing and broadcast | Curated extraction |
| `src/permissions/*` | Multisig operations and permission validation | Copied |
| `scripts/*` | Synthetic security smoke tests | Curated test copies |

No Git history, UI source, backend source, provider integration, environment configuration, credentials, or user data was copied.
