# BSC/BEP-20 Provenance

This snapshot records the BSC code used by TRONOXA at application commit `93d503e3d89274946f1e1cee8bd4bdecd13271f7`.

## Vendored core

| Field | Value |
| --- | --- |
| App path | `apps/mobile/vendor/tronoxa-bsc-core-0.1.0.tgz` |
| Package | `@tronoxa/bsc-core@0.1.0` |
| Git blob | `ef0a047e9208b3421bb3c8ec2107b407b369c506` |
| SHA-256 | `d0f0989fcf708d6f4bd85a28b82e47b11db7124a45c752c38404c2c3f03119df` |
| SHA-512 | `eb3f0e2e2597b7beda835b1ba122028162c05186211bab647198ebf9d2ee27a1f0c569a6b0f0959a83df5cec701f43a894a38d45fa959bb96bd6bcc0fe02a15e` |
| License | Apache-2.0 |

`packages/bsc-core/dist/src` contains the exact executable JavaScript and declarations from that archive. Source maps were omitted because they do not contain `sourcesContent` and are not executed. The original package documentation, license and notices are retained.

## Mobile integration

`integrations/mobile-bsc` contains exact copies of the application integration files at the commit above. These files demonstrate the security boundary around the package, including:

- feature-gated lazy loading;
- authorized, callback-scoped signing;
- address-to-signer binding;
- BSC chain-ID and RPC method allowlists;
- HTTPS and embedded-credential rejection;
- fixed token configuration for BEP-20;
- quote expiration and tamper binding;
- nonce serialization, balance and maximum-fee checks;
- post-sign decoding and field equality checks;
- local transaction-hash comparison after broadcast;
- recovery of uncertain/pending broadcasts without blind replay.

## Verify

```bash
sha256sum --check provenance/bsc-files.sha256
npm run verify:provenance
```

The hash list detects local drift in the public snapshot. A future application update must publish a new provenance record rather than silently replacing this evidence.
