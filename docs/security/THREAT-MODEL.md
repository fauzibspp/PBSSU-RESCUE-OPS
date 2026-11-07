# Security threat model

PBSSU-SEC-001 v0.1, design review only. Assets: operational records, identities/sessions, victim/responder data, GPS/media, approved reports, keys/backups and audit integrity. Adversaries: unauthenticated attacker, malicious member of another tenant, compromised responder/admin/device, abusive platform operator and malicious file sender.

Trust boundaries: device/local store → HTTPS API; untrusted request → authenticated tenant service; service → RLS database; API → object storage; DB outbox → worker; approved snapshot → exported document/user share; operator → backup/restore infrastructure. User-selected tenant UUID, device clock, MIME type, filename, GPS and sync content are untrusted.

| ID / STRIDE | Attack | Required controls | Planned evidence / residual risk |
| --- | --- | --- | --- |
| SEC-01 S/E | Forged tenant or guessed resource UUID | Active membership and resource scope every call, rejected tenant DTO fields, composite FK, forced RLS; no platform operational bypass | T-N01, T-003/004; DB privileged operators still require separate custody/audit. |
| SEC-02 S | Stolen password/refresh token | Strong hashing, throttled login/recovery, rotated refresh family, reuse detection, revoke sessions, privileged MFA proposal | T-002/T-N02; provider and TTL policy Q-03. |
| SEC-03 I | Device theft/cached GPS or victim exposure | Encrypted SQLite, OS-keystore keys, scoped cache, local unlock/expiry, minimum data and revoke/purge on reconnect | T-014/T-N03; disconnected revocation is not immediate. |
| SEC-04 T | Duplicate replay, stale edits or false device clock | Atomic receipt/hash, unique keys, base versions, append-only correction, server received_at | T-011/015/016; fabricated observations remain an operational review concern. |
| SEC-05 E | Pool/worker raw query escapes tenant | Transaction-local context, non-owner NOBYPASSRLS runtime, FORCE, query inventory and tenant-qualified jobs/caches | T-N01 pooled/worker tests; privileged migrations separated. |
| SEC-06 T/I | Malware, forged MIME, public media URL | Allowlist, size/checksum/content/decode validation, quarantine/scan, metadata strip, private buckets, brief grants and fresh download checks | T-013/T-N03; signed grants are bearer access until expiry. |
| SEC-07 T/R | Altered approved report/self-approval | Freeze on submission, server snapshot hash, maker/checker, online approval, immutable revisions/decision audit | T-019/020; approver identity recovery controls remain Q-03. |
| SEC-08 I | PDF/text/log export leaks victims or contacts | Whitelist redaction, safe templates, escaped text, sensitivity checks, sensitive-read/export audit, no payload/token logging | T-020/022/N03; manually shared exports cannot be technically recalled. |
| SEC-09 D | Oversized uploads, sync loops, expensive map queries | Per-user/tenant quotas/rate limits, bounded batches/pages/bboxes, upload limits, job retry limits/timeouts | T-N07; final quotas require capacity/load evidence. |
| SEC-10 R/T | Audit removal or silent denial | Transactional success audit, separate durable denied-action trail, restricted append grants, log access audit, protected backup | T-022/N05; DB infrastructure administrator remains privileged. |
| SEC-11 I/T | Broken backups/secret leak | Secrets outside Git, least privilege credentials, encrypted backups, restore drills, secret scan, no production fixtures | T-N05/N09; key custody, retention and owners unresolved. |
| SEC-12 T | Assignment mistaken for official agency response | Explicit manual command, internal coordination wording, no auto-dispatch/integration, acknowledgement only with verified evidence | T-010/018/UI review; operational training necessary. |

## Implementation security obligations

C-02 now explicitly isolates credential issuance to a one-time proof-bound handoff; generic DTOs/audits/logs stay secret-free. Web cookies require HttpOnly/Secure/SameSite, CSRF and strict CORS; native transport/storage requires later device validation. Never put tokens in URLs/localStorage/logs. Validate JWT algorithm/issuer/audience; session revocation must be checked despite unexpired access token. Identity recovery and role changes produce security audit events without credentials. Platform audit uses separate protected security telemetry where no organization context exists; tenant audit access never exposes global identities.

DTO allowlists forbid mass assignment of tenant/actor/status/approval fields; use explicit commands for status. Parameterized SQL, bounded spatial queries and template escaping are mandatory. Foreign tenant object access returns 404 after authentication; missing permission in current tenant returns 403; responses do not expose cross-tenant existence. Denied-action logs are written outside a rolled-back mutation transaction using protected telemetry, without victim detail.

No retention/legal compliance assertion is made. Before pilot, data owner must approve victim minimization, access grants, retention and encryption key lifecycle. Incident response runbook must cover session/key revocation, isolated account suspension, audit preservation, device loss and private export disclosure. No emergency auto-dispatch, support impersonation or official agency acknowledgement simulation is permitted.

References: [PostgreSQL RLS](https://www.postgresql.org/docs/current/ddl-rowsecurity.html), [OWASP file uploads](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html). Controls above are project design decisions informed by these sources, not evidence of implemented compliance.

## M00.2 identity threats

- SEC-ID-01/05: premature onboarding/role activation or forged invite recipient. ONBOARDING/PENDING_ACTIVATION have zero operational grants; proof lookup derives tenant tuple, scoped RLS/composite FKs remain, and activation rechecks current authority atomically. T-023/T-N01 are required runtime evidence.
- SEC-ID-02/03/06: challenge/refresh/reset replay or MFA downgrade. Bind one-time purpose/version/nonce/subject, rotate refresh ancestry, preserve MFA through password reset, no public MFA-disable/manual-support bypass. T-024 covers races and negative cases.
- SEC-ID-04: response/log/audit disclosure of hashes/seeds/action/recovery/refresh tokens or code lists. Explicit DTO allowlists, no redirect/header echoes, protected ephemeral delivery envelopes and independent identity audit. T-025 checks projections; static schema checks cannot prove actual sanitization.
- C-02 resolved policy risk: only redeemCredentialHandoff may release purpose/subject/client-bound custom-media material or web cookies after completed required proof. No generic response fallback, captured bodies/cookies, replay cache or reset-only MFA replacement. M01 mock recipient/sender/no-outbound/private-mailbox controls require tests; production delivery stays unauthorized.

[Approved delivery design](CREDENTIAL-HANDOFF.md) and [stakeholder evidence](../planning/STAKEHOLDER-APPROVAL-2026-11-07.md) are distinct from tests. T-026 adds wrong-proof/client/purpose, handoff expiry/parallel redemption, failed delivery/rotation, logger/APM capture, mock mailbox authorization and real-recipient/outbound denial cases. No secrets or synthetic proof links belong in logs/audits; a controlled test mailbox is a separate scoped surface, not an operational backdoor.
