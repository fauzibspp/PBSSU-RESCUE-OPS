# Q-01: Proposed final authorization model

PBSSU-AUTHZ-001 v0.3.0, 2026-11-07. Q-01 APPROVED by explicit project-owner instruction; [approval record](../planning/STAKEHOLDER-APPROVAL-2026-11-07.md). Six role templates and operational grants are unchanged. This is a design approval, not implemented access or runtime evidence.

## Evaluation rules

Default is DENY. An authenticated session alone grants no tenant access. For each protected request resolve active organization and membership from verified identity and the untrusted selector, check organization/user/session status, require an exact permission key, evaluate resource scope, validate MFA assurance where required, then apply workflow/version/field constraints. Unknown actions, undeclared endpoints, missing context, inactive memberships and unsupported grant scopes deny. Client role/organization/actor fields never establish authority.

Use existing OpenAPI operation IDs as permission keys, with explicit role_permissions grants. No `*`, inherited platform superuser role, user-specific bypass or implicit admin shortcut. Global self-service session capabilities are listed separately below. A grant also has `resource_scope = TENANT | ASSIGNED`; only catalogued action/scope pairs are valid. The aligned logical schema includes role_permissions.resource_scope, constrained per permission; implementation still requires a reviewed migration during future authorized implementation. Organization selection remains mandatory for both scopes. ASSIGNED means active incident_personnel membership for the parent incident; media/movement/location scope follows that incident. TENANT permits authorized records in the selected organization only.

Multiple roles combine explicit grants within the same organization. A TENANT grant can broaden an ASSIGNED grant only when expressly assigned through an approved role. MFA, sensitivity, maker/checker, lifecycle and optimistic concurrency checks cannot be bypassed by combining roles. Revocation/permission changes must affect subsequent requests: read authoritative grants or use transactionally invalidated authorization versions, never trust token role claims or a stale TTL cache. The read-only auditor template grants no mutations; a person requiring write duties needs a separate explicit role assignment whose effective union is audited.

## Role templates

| Role | Explicit grant group IDs | Resource scope / restrictions |
| --- | --- | --- |
| Platform Super Admin | P-01 | Platform onboarding metadata only; no tenant permission groups. Privileged MFA required. |
| Organization Admin | G-01, G-02, G-03, G-04, G-09, G-10, G-11 | TENANT; operational read and approved redacted export only, no operational write/approval by default. Privileged MFA required. |
| Control Room Operator | G-01, G-04, G-05, G-06, G-07, G-08, G-09, G-14, G-15, G-16 | TENANT; cannot close/cancel incidents or approve reports. Privileged MFA required. |
| Incident Commander | G-01, G-04, G-05, G-06, G-07, G-08, G-09, G-12, G-13, G-14, G-16 | TENANT; approval differs from submitter; no membership administration. Privileged MFA required. |
| Field Responder | G-01, G-04, G-07, G-14 | ASSIGNED for operational groups; G-01 is selected-tenant metadata only. Cannot create locations/control commands or approve/export reports. MFA optional until an elevated role is granted. |
| Read-Only Auditor | G-01, G-04, G-09, G-11 | TENANT, read/approved redacted export only; no private victim/contact fields. Privileged MFA required because bulk audit/export access is sensitive. |

Groups are documentation shorthand for the following exact operation keys, not runtime wildcard permissions or implicit group inheritance.

| Group | Exact permission keys | Additional conditions |
| --- | --- | --- |
| P-01 | onboardOrganization, listOrganizations | Separate platform capability; no operational records; first admin onboarding is narrowly scoped and audited. |
| G-01 | getOrganization, getSettings | Metadata in active selected membership. |
| G-02 | updateOrganization, updateSettings | Organization admin; current base version. |
| G-03 | inviteMember, revokeInvitation, updatePersonnel, setMembershipRoles, listRoles, createRole, listPermissions | Approved delegation catalogue only; no self-escalation, global credential changes or platform grants. |
| G-04 | listIncidents, getIncident, listLocations, getAssignments, listMovements, listObservations, getMedia, createDownloadGrant, getDashboard | TENANT or ASSIGNED as specified by role; dashboard and grants obey same scope, READY media only. |
| G-05 | createIncident, updateIncident, createLocation | TENANT online coordination. |
| G-06 | setAssignments | Explicit human command, no automatic emergency dispatch. |
| G-07 | createMovement, createObservation, createUploadGrant, completeMediaUpload | TENANT or ASSIGNED, server-derived actor; own upload completion unless explicit TENANT coordinator grant. |
| G-08 | createReportRevision, listReportRevisions, getReport, refreshReportDraft, submitReport, listAgencies, createAgency, recordAgencyInvolvement | Draft/submit only, no agency acknowledgement inference. |
| G-09 | listReportRevisions, getReport, requestReportExport, getReportExport | Auditors/admins see APPROVED revisions only; operators/commanders also have G-08 draft access. Exports always approved and redacted. |
| G-10 | listPersonnel, listVehicles, createVehicle, updateVehicle | Tenant administration, minimized personnel projection. |
| G-11 | listAuditLogs | Redacted tenant audit only; no global security telemetry. |
| G-12 | transitionIncident | Commander-only cancellation from DRAFT/OPEN and closure from COMPLETED; cancellation requires a reason. Post-dispatch cancellation is deferred to an approved resource-release workflow. |
| G-13 | decideReport | Commander with recent MFA; different submitter; frozen submitted snapshot and matching version. |
| G-14 | pushSync, pullSync | Transport gate plus per-operation underlying permissions and per-record scope; no sync-only authority. |
| G-15 | transitionIncident | Operator: Q-02-approved ordinary transitions only; never cancellation/closure or unsupported assignment/arrival-dependent edges. |
| G-16 | listPersonnel, listVehicles | Minimized tenant resource roster for assignment selection; excludes private contacts/registration fields and grants no administrative writes. |

G-15 restricts operator transitions; commander and operator G-14/G-16 grants cover field evidence synchronization and minimized assignment selection. Org admin and auditor receive no sync transport grant by default. Responder receives no report/agency access; necessary personnel/vehicle labels are projected through getAssignments. No role gains private personnel-directory access implicitly.

## Q-02 incident authority overlay (approved policy; Sprint 3 implementation recorded locally)

Preserve Q-01 exact grants and the six role templates. For Sprint 3, `listIncidents`/`getIncident` and `listLocations` remain governed by their existing explicit G-04 grants and resource scopes. `createIncident`, descriptive `updateIncident`, and `createLocation` use their exact G-05 permissions for Control Room Operator and Incident Commander. `transitionIncident` ordinary transitions are Operator-only through G-15; G-12 reserves cancellation from DRAFT/OPEN and closure from COMPLETED to Incident Commander. Cancellation requires a nonempty reason. Target-state checks enforce these different authorities even though the REST operation ID is shared. A successful command checks required assurance and current base version.

Organization Admin, Read-Only Auditor, Field Responder and Platform Super Admin receive no implicit incident mutation or transition authority. Explicit G-04 read grants remain unchanged: responders are assignment-scoped; admin/auditor projections remain limited to their approved read scope. Platform capability never implies tenant access. No mandatory distinct-person maker/checker is required for MVP; report approval remains a separate workflow.

Sprint 3 can accept only DRAFT→OPEN and CANCELLED from DRAFT/OPEN. `DISPATCHED` and assignment/arrival-dependent transitions are denied as unavailable until Sprint 4 evidence is implemented. This is a workflow gate, not a new permission grant. Post-dispatch cancellation/release and maintenance/breakdown behavior are deferred. These policies were approved by the Project Owner on 2026-11-07; this approval does not authorize implementation.

## Identity capability catalogue

The approved contract baseline has 75 exact operation keys: 47 TENANT keys, two PLATFORM keys, and 26 identity/session/proof capabilities listed below. Identity capability entries are not tenant-role grants; their narrow proof/self preconditions are always required. They cannot be assigned through tenant custom roles or listed by the tenant permission-catalog API. Public/credential entry endpoints have no operational authority, and a challenge UUID by itself grants nothing.

| Exact identity operation key | Authorization domain | Contract route |
| --- | --- | --- |
| login | CREDENTIAL_ENTRY | `POST /auth/login` |
| refreshSession | SESSION_REFRESH | `POST /auth/refresh` |
| revokeSession | IDENTITY_SELF | `POST /auth/logout` |
| listMyMemberships | IDENTITY_SELF | `GET /me/memberships` |
| startMfaEnrollment | BOUND_CHALLENGE | `POST /auth/mfa/enrollments` |
| confirmMfaEnrollment | BOUND_CHALLENGE | `POST /auth/mfa/enrollments/confirm` |
| verifyMfa | BOUND_CHALLENGE | `POST /auth/mfa/verify` |
| redeemRecoveryCode | BOUND_CHALLENGE | `POST /auth/mfa/recovery-codes/redeem` |
| getMfaStatus | IDENTITY_SELF | `GET /auth/mfa` |
| reauthenticate | IDENTITY_SELF | `POST /auth/reauthenticate` |
| rotateRecoveryCodes | IDENTITY_SELF | `POST /auth/mfa/recovery-codes/rotate` |
| startMfaReplacement | IDENTITY_SELF | `POST /auth/mfa/replacement` |
| confirmMfaReplacement | BOUND_CHALLENGE | `POST /auth/mfa/replacement/confirm` |
| requestPasswordReset | CREDENTIAL_ENTRY | `POST /auth/password-reset/requests` |
| confirmPasswordReset | ACTION_PROOF | `POST /auth/password-reset/confirm` |
| requestEmailVerification | CREDENTIAL_ENTRY | `POST /auth/email-verification/requests` |
| confirmEmailVerification | ACTION_PROOF | `POST /auth/email-verification/confirm` |
| changePassword | IDENTITY_SELF | `POST /auth/password/change` |
| requestEmailChange | IDENTITY_SELF | `POST /auth/email/change` |
| confirmEmailChange | IDENTITY_SELF | `POST /auth/email/change/confirm` |
| listSessions | IDENTITY_SELF | `GET /auth/sessions` |
| revokeOwnedSession | IDENTITY_SELF | `POST /auth/sessions/{sessionId}/revoke` |
| revokeAllSessions | IDENTITY_SELF | `POST /auth/sessions/revoke-all` |
| acceptInvitation | ACTION_PROOF | `POST /auth/invitations/accept` |
| activateInvitation | BOUND_CHALLENGE | `POST /auth/invitations/activate` |
| redeemCredentialHandoff | BOUND_HANDOFF | `POST /auth/credential-handoffs/{handoffId}/redeem` |

CREDENTIAL_ENTRY requires bounded credential verification or generic non-enumerating delivery request. ACTION_PROOF requires valid single-use purpose-bound proof, plus authenticated matching account for existing-user invite acceptance. BOUND_CHALLENGE requires client binding and purpose/user/version/expiry checks. IDENTITY_SELF requires current authenticated subject and any declared recent assurance. SESSION_REFRESH requires valid unconsumed refresh family; logout accepts access OR refresh solely to revoke its own session. BOUND_HANDOFF requires completed proof plus exact subject/purpose/client/version binding and one-time redemption under C-02; no tenant role can grant or bypass it. No identity capability implies TENANT permission.

createMembership is removed from the candidate contract; inviteMember replaces immediate activation. First-admin onboarding similarly reserves intent. activateInvitation alone can install accepted role grants, under the guarded atomic workflow in [identity lifecycle](../api/IDENTITY-LIFECYCLE.md). Membership PATCH cannot activate pending/inactive records. MFA requirement includes pending intended privileged grants before activation; selecting a nonprivileged organization never bypasses it.

Sensitive victim content/private contacts have no default grants in any template. Q-09 must approve separate permission keys and minimized field projections before their APIs exist. Possession of a general incident/report read permission never includes private fields. Platform admins may obtain ordinary tenant roles only by independently authorized tenant membership; platform status is ignored during operational authorization. Support impersonation and cross-tenant sharing remain excluded.

## Grant governance and bootstrap

Migration-managed permission catalogue distinguishes platform, global-self and tenant keys plus valid scopes. Tenant custom roles can only use the acting admin's explicitly delegable catalogue; possessing role-management permission does not make arbitrary keys delegable. The approved Organization Admin delegation catalogue may include the reviewed operator/commander/auditor templates without giving the admin those operational powers. This is explicit delegation authority, not a grant derived from the admin's personal operational privileges.

No actor may alter their own role assignments or widen a role they hold; another active MFA-verified tenant admin must perform the change. Custom role edits revalidate all affected memberships, scope bounds and privileged-MFA enrollment. Locked base templates cannot be edited through tenant APIs. Suspended/revoked members cannot be granted active powers; role grants do not reactivate them. Protect the last active tenant admin from accidental removal; recovery needs the separately approved custody procedure, not platform-content access. Collusion between authorized tenant admins is a residual governance risk, audited and subject to owner review.

First organization admin is established only through restricted platform onboarding/invitation with verified email and completed MFA before privileged use. Later admin additions use tenant delegation. Platform account bootstrap uses separately controlled provisioning with MFA, never a public role flag. Grants record actor, recipient, organization, exact before/after key/scope set and reason without credentials. No policy here authorizes deployment or actual account provisioning.

## Mandatory negative tests

Extend T-003/T-004/T-N01 and T-N02 with: foreign selector and resource IDs for every list/get/write/nested path; same-tenant wrong-incident IDs; body tenant/actor spoofing; no membership/inactive organization/revoked session; missing permission/unknown action; responder unassigned incident/media/dashboard/sync records; different roles across two memberships; platform-only actor attempting operational access; self-grant/custom-role widening/delegation outside catalogue; MFA enrollment bypass through tenant switching; revoked grants between request/worker/export execution; cursor/cache/object-key scope loss; pool reuse after commit/rollback/cancellation and concurrent mixed tenants. Assert HTTP non-disclosure and unchanged database state under the actual runtime role. No negative application tests were executed during M00.1.

## M00.2 freeze boundaries

Permission IDs remain exact OpenAPI operation IDs. Role input/output DTOs carry explicit permission_id/resource_scope pairs; repeated permission IDs with conflicting scopes are rejected even if JSON uniqueItems passes. Q-01 template scopes/delegation are approved as of 2026-11-07. C-02 allows only the explicitly documented dedicated handoff channel; generic API/audit/log secrecy remains mandatory. No pending session or unaccepted invitation grants operational authority. Tests T-023/024/025 extend invitation, assurance and response secrecy acceptance; none are runtime results.

## Approved Q-02 cancellation reason projection (2026-11-07)

The bounded cancellation reason is restricted operational information. Decision A permits authorized Incident Commander and Control Room Operator access; Field Responders receive status/minimum operational information; Organization Admin and Platform Super Admin receive no automatic reason access; Auditor access requires a specifically authorized audit view. Sprint 3-B stores the reason only as authenticated ciphertext in the constrained audit envelope. Per the implementation contract, generic list/get operations do not decrypt or return it; authorized retrieval is deferred and requires a separately approved projection/view design. Existing `listAuditLogs` remains redacted and does not provide that view. No reason in generic logs, public telemetry, unauthorized notifications or unredacted errors. Role grants remain exact: G-04 read scope, G-05 writes only for Operator/Commander, and transition grants only for Operator/Commander with target-state role checks. Responders have ASSIGNED-scoped read grants, which fail closed while Sprint 4 assignment evidence is absent.

Sprint 3-B permission catalog implementation (migrations 005-006) adds exactly `listIncidents`, `getIncident`, `createIncident`, `updateIncident`, and `transitionIncident`. New-organization onboarding applies the same role template mapping. Platform Super Admin receives no tenant operational grant; Organization Admin receives only G-04 read operations and no incident mutation/transition grant.

Sprint 4 S4-P-02 owner approval (2026-11-08) requires at most one active responder assignment globally per canonical `users.id`. This database uniqueness invariant does not authorize cross-tenant reads: assignment lookup and projection remain selected-tenant and permission scoped. The application must not query another tenant to precheck availability; a uniqueness conflict is normalized to a stable generic conflict without disclosing the other tenant, incident, assignment, organization, membership or responder operational record. The database binds canonical `user_id` to the selected tenant membership through a composite foreign key and enforces active uniqueness atomically.
