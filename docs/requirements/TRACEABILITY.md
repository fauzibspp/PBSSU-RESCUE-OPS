# Requirements traceability matrix

PBSSU-RTM-001 v0.2 (M00.2 candidate freeze). Operation IDs resolve in [OpenAPI](../api/openapi.json); entity names resolve in [schema](../architecture/DATABASE-SCHEMA.md) and [dictionary](../architecture/DATA-DICTIONARY.md); T-* IDs resolve in [test strategy](../testing/TEST-STRATEGY.md). Tests are planned unless the M00 validation report explicitly records execution. Module IDs are the blueprint capability IDs, not delivery milestones.

## Functional coverage

| Requirement | Modules | API operation IDs | Database entities | Planned tests |
| --- | --- | --- | --- | --- |
| FR-001 | M01, M14, M02 | onboardOrganization, listOrganizations, getOrganization, updateOrganization, getSettings, updateSettings, acceptInvitation, activateInvitation | organizations, organization_invitations, invitation_roles, roles, account_action_tokens, identity_delivery_jobs, identity_audit_logs, audit_logs, organization_settings, users, password_credentials, auth_challenges, memberships, membership_roles, mfa_credentials | T-001, T-023, T-022, T-002, T-003, T-024, T-025, T-026, T-004 |
| FR-002 | M02 | login, refreshSession, revokeSession, startMfaEnrollment, confirmMfaEnrollment, verifyMfa, redeemRecoveryCode, getMfaStatus, reauthenticate, rotateRecoveryCodes, startMfaReplacement, confirmMfaReplacement, requestPasswordReset, confirmPasswordReset, requestEmailVerification, confirmEmailVerification, changePassword, requestEmailChange, confirmEmailChange, listSessions, revokeOwnedSession, revokeAllSessions, acceptInvitation, activateInvitation, redeemCredentialHandoff | users, password_credentials, sessions, auth_challenges, identity_audit_logs, credential_handoffs, session_refresh_tokens, mfa_credentials, identity_delivery_jobs, recovery_codes, account_action_tokens, organization_invitations, invitation_roles, memberships, organizations, membership_roles, roles, audit_logs | T-002, T-N02, T-024, T-025, T-026, T-001, T-003, T-023, T-004, T-N03 |
| FR-003 | M02 | listMyMemberships, inviteMember, revokeInvitation, acceptInvitation, activateInvitation | memberships, membership_roles, roles, organizations, organization_invitations, invitation_roles, account_action_tokens, identity_delivery_jobs, audit_logs, identity_audit_logs, users, password_credentials, auth_challenges, mfa_credentials | T-003, T-024, T-025, T-026, T-004, T-005, T-023, T-001, T-002 |
| FR-004 | M02 | setMembershipRoles, listRoles, createRole, listPermissions, inviteMember, revokeInvitation, activateInvitation | memberships, membership_roles, roles, role_permissions, permissions, organizations, organization_invitations, invitation_roles, account_action_tokens, identity_delivery_jobs, audit_logs, identity_audit_logs, users, auth_challenges, mfa_credentials | T-004, T-003, T-005, T-023, T-001, T-002, T-024, T-025, T-026 |
| FR-005 | M03, M02 | listPersonnel, updatePersonnel, inviteMember, acceptInvitation | memberships, audit_logs, organizations, organization_invitations, invitation_roles, roles, account_action_tokens, identity_delivery_jobs, identity_audit_logs, users, password_credentials, auth_challenges | T-005, T-003, T-004, T-023, T-001, T-002, T-024, T-025, T-026 |
| FR-006 | M04 | listVehicles, createVehicle, updateVehicle | vehicles | T-006 |
| FR-007 | M05, M13 | listIncidents, createIncident, getIncident, updateIncident, transitionIncident | incidents, change_events, audit_logs | T-007, T-017, T-022, T-N01, T-N09, T-N10 |
| FR-008 | M11 | createReportRevision | reports, report_counters | T-008, T-018, T-019 |
| FR-009 | M05, M07, M13 | listLocations, createLocation | incidents, incident_locations, change_events, audit_logs | T-009, T-022, T-N01, T-N09, T-N10 |
| FR-010 | M06 | getAssignments, setAssignments | incident_personnel, incident_vehicles, incidents, memberships, vehicles | T-010 |
| FR-011 | M09 | listMovements, createMovement | movement_logs, incident_vehicles | T-011 |
| FR-012 | M08 | listObservations, createObservation | situation_updates, incident_locations | T-012 |
| FR-013 | M08 | createUploadGrant, completeMediaUpload, getMedia, createDownloadGrant | incident_media, outbox_jobs, audit_logs | T-013 |
| FR-014 | M10 | pushSync, pullSync | sync_operations, change_events, situation_updates, movement_logs, audit_logs, incidents, incident_locations, incident_personnel, incident_vehicles, incident_media | T-014, T-015, T-016 |
| FR-015 | M10 | pushSync, pullSync | sync_operations, change_events, situation_updates, movement_logs, audit_logs, incidents, incident_locations, incident_personnel, incident_vehicles, incident_media | T-014, T-015, T-016 |
| FR-016 | M10 | pushSync, pullSync | sync_operations, change_events, situation_updates, movement_logs, audit_logs, incidents, incident_locations, incident_personnel, incident_vehicles, incident_media | T-014, T-015, T-016 |
| FR-017 | M05 | transitionIncident | incidents, audit_logs | T-007, T-017 |
| FR-018 | M05, M11 | listAgencies, createAgency, recordAgencyInvolvement, createReportRevision, listReportRevisions, getReport, refreshReportDraft | agencies, incident_agencies, reports, report_counters, report_approvals | T-018, T-008, T-019 |
| FR-019 | M11 | createReportRevision, listReportRevisions, getReport, submitReport, decideReport | reports, report_counters, report_approvals, audit_logs | T-008, T-018, T-019 |
| FR-020 | M11 | requestReportExport, getReportExport | reports, report_approvals, outbox_jobs, audit_logs | T-020 |
| FR-021 | M12 | getDashboard | incidents, incident_vehicles, reports | T-021 |
| FR-022 | M02, M01, M13, M14 | login, refreshSession, revokeSession, onboardOrganization, listAuditLogs, updateSettings, startMfaEnrollment, confirmMfaEnrollment, verifyMfa, redeemRecoveryCode, reauthenticate, rotateRecoveryCodes, startMfaReplacement, confirmMfaReplacement, requestPasswordReset, confirmPasswordReset, requestEmailVerification, confirmEmailVerification, changePassword, requestEmailChange, confirmEmailChange, revokeOwnedSession, revokeAllSessions, inviteMember, revokeInvitation, acceptInvitation, activateInvitation, redeemCredentialHandoff | users, password_credentials, sessions, auth_challenges, identity_audit_logs, credential_handoffs, session_refresh_tokens, organizations, organization_invitations, invitation_roles, roles, account_action_tokens, identity_delivery_jobs, audit_logs, organization_settings, mfa_credentials, recovery_codes, memberships, membership_roles | T-002, T-N02, T-024, T-025, T-026, T-001, T-023, T-022, T-003, T-004, T-005, T-N03 |

## Non-functional coverage

| Requirement | Modules | API / implementation surfaces | Entities | Planned tests |
| --- | --- | --- | --- | --- |
| NFR-001 | M01, M02, M13 | All protected operations, workers, media/export grants | organizations, memberships, roles, role_permissions, membership_roles, incidents | T-N01 |
| NFR-002 | M02, M13 | All identity lifecycle operations and all protected operations | users, password_credentials, sessions, session_refresh_tokens, mfa_credentials, recovery_codes, auth_challenges, account_action_tokens, memberships, identity_audit_logs | T-N02 |
| NFR-003 | M03, M08, M10, M11, M13 | createUploadGrant, createDownloadGrant, pushSync, requestReportExport; encrypted local cache | memberships, incident_victims, incident_media, reports, audit_logs | T-N03 |
| NFR-004 | M09, M10, M13 | pushSync, pullSync, createMovement, createObservation | sync_operations, change_events, movement_logs, situation_updates, outbox_jobs | T-N04 |
| NFR-005 | M01, M13 | Backup/restore process (no public API) | All database entities and private media artifacts | T-N05 |
| NFR-006 | M07, M10, M12 | All web/mobile flows; offline/permission/error states | organization_settings | T-N06 |
| NFR-007 | M05, M10, M11, M12 | listIncidents, pushSync, pullSync, getDashboard, export worker | incidents, change_events, reports, outbox_jobs | T-N07 |
| NFR-008 | M13 | API/worker health, deployment/incident runbooks | outbox_jobs, notification_deliveries | T-N08 |
| NFR-009 | M01, M02, M13 | OpenAPI/DTO/migration/CI review across all operations | All entities, RLS and migration inventory | T-N09 |
| NFR-010 | M13 | All protected operations; telemetry/alerts and listAuditLogs | audit_logs, outbox_jobs | T-N10 |

## Cross-cutting constraints

Every operation additionally requires T-N01 authorization/isolation checks, T-N09 contract validation and T-N10 redaction checks where applicable. All domain mutations write audit and change/outbox records as appropriate even when these supporting tables are not repeated in every feature row. Agency directory/involvement supports FR-018 without implying acknowledgement. Victim storage is reserved, with entry API deferred to Q-09; reports/exports do not expose private victim fields. M14 settings supports FR-001 and FR-022. Requirements have design coverage; no implementation or passing application-test coverage is claimed.

## Approved Sprint 3 cross-module contract freeze

Owner approval Q-02 on 2026-11-07 freezes exactly three new tables (`incidents`, `incident_locations`, `change_events`) and seven new operations (`listIncidents`, `createIncident`, `getIncident`, `updateIncident`, `transitionIncident`, `listLocations`, `createLocation`); implementation is not authorized. Incident operations are M05-owned. Location operations remain M07-owned subresources and are included in the Sprint 3 delivery slice, with M05 parent-incident authorization/version checks and M13 audit/change-event controls. The OpenAPI operation IDs remain permission keys; this freeze adds no permission key or role grant.

Approved Decision A and B (2026-11-07) trace cancellation-reason projection and append-only/no-purge constraints through FR-007/FR-009/FR-022 and NFR-003/NFR-010; operations `listIncidents`, `getIncident`, `transitionIncident`, `listAuditLogs`; entities `incidents`, `audit_logs`, `change_events`; tests T-007, T-017, T-022, T-N03, T-N10. Full reason is restricted to authorized Commander/Operator incident reads; responder is minimized; Org Admin/Platform have no automatic access. Auditor reason access has no current API projection (`listAuditLogs` omits metadata) and is a deferred contract dependency. No API, permission or role grant is added. Append-only writes/corrections and no Sprint 3 purge are checked under Q-05 OPEN; no indefinite-retention policy is inferred.


## M00.2 identity security traceability

| Security requirement | Functional/NFR links | Modules | API surfaces | Entities | Planned tests |
| --- | --- | --- | --- | --- | --- |
| SEC-ID-01 | FR-001, FR-003, FR-004, NFR-001 | M01, M02 | onboardOrganization, inviteMember, acceptInvitation, activateInvitation, revokeInvitation | organizations, organization_invitations, invitation_roles, memberships, membership_roles | T-001, T-003, T-004, T-023 |
| SEC-ID-02 | FR-002, NFR-002 | M02 | login, startMfaEnrollment, confirmMfaEnrollment, verifyMfa, reauthenticate, redeemRecoveryCode, startMfaReplacement, confirmMfaReplacement | users, password_credentials, mfa_credentials, recovery_codes, auth_challenges, sessions | T-002, T-024 |
| SEC-ID-03 | FR-002, NFR-002 | M02 | refreshSession, revokeSession, listSessions, revokeOwnedSession, revokeAllSessions | users, sessions, session_refresh_tokens | T-002, T-024 |
| SEC-ID-04 | FR-022, NFR-003, NFR-010 | M02, M13 | All identity success/error/header/redirect projections | identity_audit_logs, audit_logs, identity_delivery_jobs | T-022, T-025, T-N03 |
| SEC-ID-05 | FR-003, FR-004, NFR-001 | M01, M02 | inviteMember, revokeInvitation, acceptInvitation, activateInvitation, setMembershipRoles, createRole | organization_invitations, invitation_roles, roles, role_permissions, account_action_tokens, platform_grants | T-003, T-004, T-023, T-N01 |
| SEC-ID-06 | FR-002, NFR-002, NFR-003 | M02 | requestPasswordReset, confirmPasswordReset, requestEmailVerification, confirmEmailVerification, requestEmailChange, confirmEmailChange, changePassword, rotateRecoveryCodes | password_credentials, account_action_tokens, identity_delivery_jobs, sessions, mfa_credentials, recovery_codes | T-002, T-024, T-025 |

No createMembership key remains in the candidate contract. All 75 operations and 40 entities resolve in the current catalogue/schema; runtime test execution is still pending. C-01 structural mapping is aligned; C-02 is resolved by the explicit one-time handoff; adapter implementation/verification and production-provider authorization remain separate gates.


## Approved C-02 trace link

SEC-ID-04 / FR-002 / FR-022 / NFR-002/003/010 → M02/M13 → redeemCredentialHandoff → credential_handoffs, users, sessions, session_refresh_tokens, auth_challenges, mfa_credentials, recovery_codes, identity_audit_logs → T-026/T-024/T-025/T-N02/T-N03. Non-tenant BOUND_HANDOFF capability is not delegated through any tenant role. All six approved role templates and existing tenant permission keys remain unchanged; synthetic mock delivery creates no operational authority. [Approval](../planning/STAKEHOLDER-APPROVAL-2026-11-07.md) is distinct from execution results.

## Sprint 4 approved scope trace

Owner-approved Sprint 4 policy package S4-P-01 through S4-P-09 maps FR-010 to `getAssignments`/`setAssignments` and entities `incident_personnel`, `incident_vehicles`, `incidents`, `memberships`, `users`, and `vehicles` with G-04/G-06; FR-011 maps `listMovements`/`createMovement` to `movement_logs` and `incident_vehicles` with G-04/G-07. These are the four existing operations in the unchanged 75-operation OpenAPI inventory; they introduce no operation IDs. `PersonnelAssignment.duty` is optional/nullable in output, absent from `AssignmentInput`, and has no database default or approved vocabulary. T-010/T-011 cover that contract, tenant/RLS isolation, global per-user active responder uniqueness, assignment interval history, movement lineage, server-derived actor/receipt time, and explicit non-automation of lifecycle transitions. Existing `transitionIncident` (DISPATCHED prerequisites only) and `updateVehicle` (active-assignment state guard) are bounded dependencies. All tests remain planned until run and recorded.
The Technical Lead's bounded clarification states that assignments remain active from DISPATCHED until a separately authorized future resource-release workflow explicitly ends them. Sprint 4 does not implement post-dispatch release/replacement or any terminal incident transitions; future COMPLETED/CLOSED commands must be blocked while assignments remain unresolved. T-010 covers non-release and resource uniqueness after DISPATCHED; T-007 covers unavailable lifecycle edges. This clarification introduces no entity, endpoint, permission or role.
