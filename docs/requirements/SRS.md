# Software Requirements Specification

Document PBSSU-SRS-001, version 0.3.0, 2026-11-07; approved foundation policy. Source: [blueprint](../planning/PROJECT-BLUEPRINT.md) and [owner approval](../planning/STAKEHOLDER-APPROVAL-2026-11-07.md). Acceptance criteria define future tests, not executed results.

## Scope and actors

Deliver a shared-database, tenant-isolated volunteer rescue platform: Flutter Android/iOS field app, React command center, NestJS modular monolith, PostgreSQL/PostGIS, encrypted SQLite and private S3-compatible storage. PBSSU is the pilot organization. Users can hold different roles in several organizations. An incident belongs to exactly one organization. Platform administration grants no operational-content access.

Actors: Platform Super Admin (onboarding), Organization Admin (tenant administration), Control Room Operator (incident coordination), Incident Commander (operational validation/closure/approval), Field Responder (assigned field work), Read-Only Auditor (permitted review). Proposed role permissions are in the architecture; stakeholders must confirm assignment scope and approval separation.

Exclude AI predictions, continuous live tracking, public emergency alerts, official agency integrations, automatic emergency dispatch, financial/banking workflows and inter-organization sharing from MVP. Manual assignment is an internal coordination record, never evidence of emergency-service acknowledgement.

## Functional requirements and acceptance criteria

| ID | Requirement | Observable acceptance criterion |
| --- | --- | --- |
| FR-001 | Organization registration and management | Platform onboarding atomically creates ONBOARDING organization and FIRST_ADMIN invitation intent only. Active admin membership/roles require accepted recipient, verified email and required MFA through guarded activation. |
| FR-002 | Secure authentication | Valid first factor yields restricted bound challenge or session metadata; privileged sessions require MFA. Recovery/refresh/logout honor one-time proof and revocation; no generic identity-secret response or logging, and only the explicit bound handoff releases material after all required proof. |
| FR-003 | Multiple organization memberships | Invitations reserve tenant roles without authority; acceptance/required MFA precede explicit activation. A user selects one ACTIVE membership; pending/inactive/revoked context denies. |
| FR-004 | Tenant roles and permissions | Admin delegates only allowed exact permission/scope grants, never platform/self escalation. Pending memberships cannot become active by PATCH or role assignment. |
| FR-005 | Personnel records | Admin creates/updates tenant member profiles; private fields are absent from unauthorized views. |
| FR-006 | Vehicle register | Tenant admin maintains vehicles with tenant-unique call signs; other tenants cannot query them. |
| FR-007 | Incident management | Authorized staff create/edit versioned incidents and apply only permitted lifecycle transitions. |
| FR-008 | Organization/year report reference | First report draft atomically allocates a unique organization/year sequence; concurrent requests never duplicate it. |
| FR-009 | Multiple incident locations | One incident accepts six independently identified locations; cross-incident and cross-tenant references fail. |
| FR-010 | Responder/vehicle assignment | Explicit authorized online action assigns active members and eligible vehicles to the incident, audited without external dispatch. |
| FR-011 | Movement events | Assigned vehicle events preserve departure/arrival/return occurrence and receipt times; corrections append a superseding event. |
| FR-012 | Observations and risks | Assigned responders append observations against assigned incidents/locations with occurrence time and risk level. |
| FR-013 | Photos and optional GPS | Authorized upload remains quarantined until validated; optional point has valid longitude/latitude and accuracy. |
| FR-014 | Offline field entry | Encrypted local outbox survives restart; unconfirmed changes visibly remain pending. |
| FR-015 | Duplicate-free synchronization | Replaying the same operation returns its stored outcome and creates no duplicate domain record. |
| FR-016 | Conflict resolution | Stale base version returns conflict; user reviews current record and submits a new operation; no silent overwrite. |
| FR-017 | Incident closure | Commander closes only COMPLETED incidents with recorded outcome/reason and current version; report approval is separate. |
| FR-018 | Structured reports | Draft snapshots include required operational sections and provenance; missing victim/agency data is marked not recorded, not inferred. |
| FR-019 | Report approval/versioning | Online commander decision locks submitted snapshot; approved revisions cannot change; corrections use a new version. |
| FR-020 | Approved exports | Authorized users obtain PDF or WhatsApp-compatible redacted text from an approved snapshot; export does not send a message. |
| FR-021 | Tenant dashboards | Counts, maps, filters and details include only tenant- and role-permitted incidents. |
| FR-022 | Auditable sensitive actions | Writes, permission changes, approvals, exports and sensitive reads record actor/context/result without private payloads or tokens. |

## Non-functional requirements

| ID | Requirement / proposed acceptance target |
| --- | --- |
| NFR-001 | Isolation: application checks, composite foreign keys and forced PostgreSQL RLS on every tenant table; negative tests for every API/background path. No bypass by platform admins. |
| NFR-002 | Candidate local verified email/password/Argon2id, privileged MFA, bounded JWT/refresh rotation and authoritative revocation. No generic identity-secret response or log projections. Q-03/C-02 are approved; dedicated handoff and synthetic/mock-only M01 enforce the delivery boundary, subject to runtime verification. |
| NFR-003 | Privacy: encrypted local sensitive data, private media, minimized exports/logs, least-privilege access and approved retention/deletion policy before pilot. |
| NFR-004 | Reliability: durable outbox, idempotency retained at least as long as replay horizon, version conflict detection and transactional audit writes. |
| NFR-005 | Recovery: daily encrypted backups and restore exercises; proposed RPO 24 hours/RTO 4 hours, subject to Q-06. |
| NFR-006 | Usability: Bahasa Melayu primary, English optional; WCAG 2.2 AA proposed for web, screen-reader and outdoor/mobile checks; no color-only states. |
| NFR-007 | Performance: proposed p95 ordinary API read <500 ms and write <1 s excluding uploads/exports at 50 concurrent users, 10 tenants and 100,000 incidents total; measure on agreed staging hardware. |
| NFR-008 | Availability: proposed 99.5% monthly API availability excluding agreed maintenance; instrumentation and support ownership require approval. |
| NFR-009 | Maintainability: OpenAPI contract, DTO validation, migrations, dependency audit, reproducible builds and modular ownership. |
| NFR-010 | Observability: tenant-safe correlation IDs, metrics, structured redacted logs, health checks and actionable alerts without operational payloads. |

These targets have been reviewed for design feasibility only. No benchmark, restoration or availability measurement occurred in M00; capacity and service-level commitments remain unvalidated.

## State machines and rules

Incident normal path: DRAFT → OPEN → DISPATCHED → ON_SCENE → MONITORING → RETURNING → COMPLETED → CLOSED. Proposed explicit alternative ON_SCENE → RETURNING permits non-monitoring incidents; Q-02 must approve it before implementation. Cancellation transitions to CANCELLED from DRAFT/OPEN/DISPATCHED/ON_SCENE/MONITORING/RETURNING require authorized command action and reason; no cancellation from COMPLETED/CLOSED. No backward transition or reopening in MVP. DISPATCHED requires at least one member and vehicle assignment; ON_SCENE requires arrival evidence; COMPLETED requires outcome; CLOSED requires commander review. These guards are proposals requiring operational sign-off. An incident can be COMPLETED/CLOSED while its report awaits approval.

Report: DRAFT → SUBMITTED → APPROVED or REJECTED. Submission freezes the snapshot; rejection preserves it and its reason. A rejected or approved version is superseded by a new DRAFT with the same report number and incremented revision. No editing submitted/approved/rejected versions. Approval requires online reauthorization and a fresh version check. Proposed maker/checker: approver differs from submitter; exceptions require an approved future policy, no implicit admin bypass.

Dates: persist UTC instants; render Asia/Kuala_Lumpur (UTC+08:00). Report sequence year uses incident occurrence date in Asia/Kuala_Lumpur, frozen at initial allocation. Device occurrence time is untrusted evidence; retain server receipt time separately. GPS is optional per observation, never a mandatory background permission.

## References and completeness

Each requirement maps to blueprint modules, operation IDs, entities and planned tests in [traceability](TRACEABILITY.md). [Scenario](../examples/FLOOD-MONITORING-2026-11-05.md) is synthetic documentation, not a factual operational report. Open decisions in [register](../planning/DECISION-REGISTER.md) remain release gates.

M00.1 recommends exact tenant role grants/scopes, local email/password with Argon2id, privileged MFA and secure recovery, and a source-reviewed toolchain. See [authorization](../security/AUTHORIZATION-MODEL.md), [authentication](../security/AUTHENTICATION-ARCHITECTURE.md) and [compatibility](../architecture/FOUNDATION-COMPATIBILITY.md). Foundation refinements are now approved under the owner record; FR-002/003/004 and NFR-001/002 still require actual acceptance tests. The approved baseline aligns OpenAPI0.3.0, 40-entity schema/dictionary, exact grants and traceability; [M01 readiness](../planning/M01-READINESS.md) retains explicit M01 authorization and runtime/provider gates before identity implementation.

## M00.2 identity security acceptance

SEC-ID-01–06 in the [identity lifecycle](../api/IDENTITY-LIFECYCLE.md) refine FR-001/002/003/004/022 and NFR-001/002/003/010. T-023 covers staged onboarding/activation, T-024 challenges/MFA/rotation/recovery, and T-025 response/audit/log secrecy. Session-only login/createMembership immediate activation is superseded in the candidate contract; existing-user acceptance requires actual authentication, not email or UUID matching. Grant-scope DTOs reject unauthorized scope widening. No production runtime test or approval is implied by the candidate freeze.

## Official approval and delivery boundary

[Owner approval dated 2026-11-07](../planning/STAKEHOLDER-APPROVAL-2026-11-07.md) accepts Q-01/Q-03 and Q-04 implementation families and C-02 policy. Generic responses stay metadata-only; redeemCredentialHandoff alone releases one-time proof-bound SESSION/TOTP_SETUP/RECOVERY_CODES material under the documented custom-media/cookie controls. Email invitation/account recovery cannot waive MFA. M01 delivery uses synthetic/mock-only; no production outbound or real-user provisioning authorized. T-026 adds handoff/mock/production-denial acceptance; implementation and runtime proof remain outstanding.
