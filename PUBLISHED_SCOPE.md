# Published Scope Manifest

Source application: private TRONOXA production repository at commit `93d503e3d89274946f1e1cee8bd4bdecd13271f7`.

| Public path | Review purpose | Fidelity |
| --- | --- | --- |
| `src/wallet/tron-keys.ts` | Mnemonic/private-key validation and TRON derivation | Byte-identical |
| `src/wallet/vault-codec.ts` | AES-256-GCM vault format and tamper rejection | Byte-identical |
| `src/wallet/storage.ts` | Encrypted vault / OS secure-store boundary | Byte-identical |
| `src/security/app-security.ts` | PIN and local authorization state | Byte-identical |
| `src/security/transaction-validation.ts` | Imported transaction integrity and allowlisting | Byte-identical |
| `src/signing/signed-transaction.ts` | Signed-transaction recovery validation | Byte-identical |
| `src/signing/tron-transactions.ts` | TRX/TRC-20 signing and broadcast | Exact bodies of the listed exported security functions |
| `src/permissions/*` | Multisig operations and permission validation | Byte-identical |
| `packages/bsc-core/` | Executable `@tronoxa/bsc-core@0.1.0` package | Exact text extracted from the vendored archive |
| `integrations/mobile-bsc/` | Mobile BSC/BEP-20 integration and policy enforcement | Byte-identical source files |
| `scripts/*` | Synthetic security tests and provenance checks | Public verification code |

The BSC archive is identified by Git blob `ef0a047e9208b3421bb3c8ec2107b407b369c506` and SHA-256 `d0f0989fcf708d6f4bd85a28b82e47b11db7124a45c752c38404c2c3f03119df`.

## Deliberately excluded

UI screens, navigation, translations, branding, analytics, pricing, order/provider business logic, deployment files, credentials, user data and application-store signing material are excluded. The backend custody boundary is documented, but unrelated backend implementation is not published here.

## Meaning of fidelity

“Byte-identical” refers to the file content at the recorded application commit. It does not prove that a store binary was built from that commit. Binary equivalence requires a release checksum and build provenance attestation.
