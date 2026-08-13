# Security Policy

## Supported code

Security fixes target the latest `main` branch and the newest published release. Older snapshots may be used for comparison but are not guaranteed to receive patches.

## Report a vulnerability privately

Use [GitHub private vulnerability reporting](https://github.com/mharb787/tronoxa-security-core/security/advisories/new). If that channel is unavailable, email [office@tronoxa.com](mailto:office@tronoxa.com) and request a private channel before sending technical details.

Do not open a public issue for a vulnerability that may expose wallet secrets, enable unauthorized signing, redirect funds, bypass transaction confirmation, confuse chain/token identity or compromise a release artifact.

Include:

- affected commit or release;
- component and attack preconditions;
- synthetic reproduction steps;
- expected and observed result;
- practical impact and suggested mitigation, if known.

Never send or include a Recovery Phrase, Private Key, PIN, OTP, API credential, real user address, signed production payload or production configuration.

## Response targets

| Stage | Target |
| --- | --- |
| Acknowledgement | 3 business days |
| Initial triage | 7 business days |
| Status updates | At least every 14 days while active |
| Coordinated disclosure | After a fix and user-safety plan are available |

Targets are best-effort, not a warranty. Reporters acting in good faith, avoiding privacy violations and fund movement, and allowing reasonable remediation time will be treated under a coordinated-disclosure approach.

## Good-faith security research

Research is in scope when it targets code published in this repository or an official TRONOXA property, uses accounts, devices and funds controlled by the researcher, minimizes data access, and stops after confirming the security impact.

The following activities are out of scope:

- accessing, changing or retaining another person's data;
- moving or risking funds that the researcher does not own;
- social engineering, phishing, denial of service, spam or physical attacks;
- testing third-party services in a way that violates their terms;
- publishing an unresolved vulnerability before coordinated disclosure.

When a researcher follows this policy, makes a good-faith effort to avoid privacy harm and service disruption, and provides reasonable remediation time, TRONOXA will not initiate legal action solely for that policy-compliant research. This statement does not authorize unlawful activity, waive third-party rights or bind third parties.

## Local cryptographic boundary

- **Mnemonic:** BIP-39 English wordlist validation.
- **TRON derivation:** BIP-44/SLIP-44 path `m/44'/195'/0'/0/index`.
- **BSC derivation:** BIP-44 path `m/44'/60'/0'/0/index`.
- **Vault encryption:** AES-256-GCM, 32-byte random key, 12-byte random IV, 16-byte authentication tag and fixed versioned AAD.
- **Randomness:** platform cryptographic `getRandomValues`.
- **PIN verifier:** PBKDF2-HMAC-SHA-256 with per-record 16-byte salt plus attempt throttling and extended lockouts. The PIN is an authorization gate; it is not the AES vault key.
- **Key storage:** the AES key is held in the operating-system secure store with this-device-only/unlocked accessibility, separate from encrypted vault ciphertext.
- **BSC signing:** callback-scoped signer; mutable private-key bytes are overwritten when possible; expected signer address and every signed transaction field are verified before broadcast.
- **Network binding:** BSC chain ID is checked, RPC methods are allowlisted, embedded RPC credentials are rejected and only reviewed token contracts/calldata are accepted.

JavaScript runtimes cannot promise physical memory erasure. Device compromise, malicious keyboards, rooted/jailbroken systems, supply-chain compromise and unsafe phrase handling remain residual risks.

## Scope boundaries

TRONOXA is non-custodial, but it uses backend services for non-secret operations. Those services must never receive recovery phrases or private keys. A public source snapshot and automated scanner do not constitute a formal independent audit or a guarantee of zero vulnerabilities.

## Disclosure credit

With the reporter's consent, fixed advisories may credit the reporter in [Security Acknowledgements](SECURITY_ACKNOWLEDGEMENTS.md). Public disclosure timing and technical detail must be coordinated to avoid exposing users before updates are available.
