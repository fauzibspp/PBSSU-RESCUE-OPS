# Foundation decisions, approvals and remaining gates

PBSSU-REG-001 v0.4, 2026-11-07. Current approval authority is the [explicit project-owner record](STAKEHOLDER-APPROVAL-2026-11-07.md), separate from technical validation. Prior pending statuses in historical validation records describe their original dates only.

| Decision | Current status | Scope and remaining verification |
| --- | --- | --- |
| Q-01 | APPROVED 2026-11-07 | Tenant DENY defaults, six roles, exact scoped keys/delegation, no automatic platform operational access. Approved current contract has 75 keys (47 tenant/two platform/26 identity/handoff); added handoff capability is non-tenant, proof-bound only. |
| Q-03 | APPROVED POLICY 2026-11-07 | Local email/password/Argon2id, privileged TOTP MFA, rotation/revocation, guarded invitation activation and separate account/MFA recovery. Runtime hash/parameter/security behavior still needs tests; all-factor recovery custody not automatically operational. |
| Q-04 | APPROVED IMPLEMENTATION BASELINE 2026-11-07 | Node24/Nest12/PostgreSQL18/PostGIS3.7/Kysely+pg/explicit SQL/npm workspaces. Exact pins/peers/digests/native/runtime compatibility remain unverified gates. Web/mobile exact choices are not silently approved. |
| C-01 | ALIGNED APPROVED LOGICAL CONTRACT | OpenAPI0.3.0, 40-entity schema/dictionary/FK model, eight identity lifecycle catalogues and exact permission/requirements/test mapping. Not runtime enforcement evidence. |
| C-02 | RESOLVED_POLICY_CONTRACT 2026-11-07 | [Explicit one-time handoff](../security/CREDENTIAL-HANDOFF.md): no generic secret responses/log/audit disclosure, all required proof/MFA retained. Approved future email invitation channel; M01 mock/synthetic only, no outbound or production secret delivery. |

## Operational/implementation gates, separate from approval

| Gate | Required evidence / authorization |
| --- | --- |
| G-DELIVERY-DEV | Implement controlled mock-only mail, synthetic recipients, private authorized local test mailbox and proof-bound handoff. No adapter exists/tested yet. No logging/public exposure of synthetic links. |
| G-DELIVERY-PROD | Future provider/sender/domain/transport/key custody/retention and explicit real delivery authorization. NOT AUTHORIZED by baseline approval. |
| G-RECOVERY-OPS | Account reset must preserve MFA. All-factor recovery requires independent custodians/evidence/cooling controls; keep unavailable until operationally approved. |
| G-RUNTIME | Resolve/pin exact reviewed packages/image digest; execute native Argon2, migration/RLS/composite-FK/pool/concurrency/CSRF/projection tests. No result supplied by approval. |
| G-M01 | Explicit authorization to start the [proposed backend scope](M01-READINESS.md). This turn permits baseline documentation/validation/local commit only. |
| G-WEB-MOBILE | Later exact frontend/Flutter/encrypted-SQLite/device/build/license choices and checks; not forced into backend-only M01. |

## Questions retained at their feature/pilot gates

| ID | Unresolved question / proposed owner | Blocks |
| --- | --- | --- |
| Q-02 | Cancellation/alternative transitions, resource prerequisites, no-vehicle incidents, maker/checker and reopen policy? Operations lead. | Lifecycle and report workflows. |
| Q-05 | Retention/erasure/legal holds, device offline horizon, lost-device response and report sensitivity? Data owner + qualified privacy reviewer. Proposed cursor 30d/receipt 90d only. | Sync expiry, exports and pilot data use. |
| Q-06 | Hosting/data location, approved budget, daily backup owner, RPO/RTO, availability/support and load profile? Operations/infrastructure owner. | Service commitments and deployment. |
| Q-07 | Report numbering format and local-year rule, required report template, sign-off authority, allowed export recipients? Operations lead. | Report implementation/UAT. |
| Q-08 | Actual team capacity, Android/iOS minimum OS, macOS build access and device test inventory? Delivery lead. | Reliable schedule and iOS build verification. |
| Q-09 | Victim-data minimum fields and field encryption/key custody, approved access procedure? Data owner/security. | Victim data implementation/pilot. |
| Q-10 | Agency directory ownership and evidence needed for any manual acknowledgement? Operations lead. | Agency evidence UI; no official integration assumed. |

## Assumptions and risks retained

A-01 global login/tenant-local profiles is accepted in the foundation. A-02 report family/local-year rule, A-03 offline write scope, A-04 no sharing/impersonation, A-05 minimized export and A-06 staffing/schedule remain documented working assumptions for their feature gates; this approval grants no sharing or dispatch authority.

R-01 tenant-context/pool leakage, R-02 lost device/token, R-03 sync conflicts, R-04 media/export leakage, R-05 mistaken agency response, R-06 recovery/capacity and R-07 privacy policy remain runtime/operational risks. C-02 policy resolution does not remove implementation disclosure/replay/CSRF/mail risks. Use purpose/version/client-bound one-time release, explicit generic-response allowlists, mock-only startup/recipient checks and redacted dual audit streams; prove them before use.

No exact version/digest or test result is approved. Blueprint safety constraints remain. No real identities/contacts/banking data, production sends, deployment or M01 implementation is authorized by the baseline commit.
