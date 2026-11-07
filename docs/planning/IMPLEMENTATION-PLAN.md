# Implementation plan and sprint backlog

PBSSU-PLAN-001 v0.1. M00 is documentation only and ends at approval handoff. The blueprint's M01–M14 are module identifiers, not implementation order. Delivery milestone M01 below is the foundation gate spanning modules M01/M02/M13; subsequent work uses sprint gates to avoid naming collision.

## M00 execution and exit

1. Inspect repository/rules/blueprint and available environment without starting services.
2. Baseline SRS and assumptions; define architecture, relational invariants, dictionary and API.
3. Document screens, threats, tests, decisions and sanitized scenario.
4. Map all FR/NFR requirements to modules, operations, entities and planned tests.
5. Validate machine-readable references, coverage and document links; manually review lifecycle, isolation, sync and reports.
6. Record validation limits/open questions, stop and request M01 approval.

## Proposed delivery M01: foundation and tenant security

The [owner approval](STAKEHOLDER-APPROVAL-2026-11-07.md) accepts Q-01/Q-03/backend Q-04 and resolves C-02 at policy/contract level. OpenAPI0.3.0/40 logical entities and explicit one-time handoff are the current baseline. M01 implementation is still NOT authorized; this turn ends at a validated local documentation commit.

The [readiness report](M01-READINESS.md) defines exact future backend-only scope: 22 foundation tables, 40 foundation operations, explicit SQL migrations/RLS/context/pooling, identity/RBAC/MFA/recovery/audit and isolated handoff with controlled mock-only synthetic mail. No real outbound messages, production provider or React/Flutter scaffolding. Exact pins/digests/runtime and security checks remain acceptance tasks after separate M01 approval. Re-estimate the old foundation duration against actual capacity; no schedule/benchmark claim is approved.

## Nine-sprint backlog (18-week hypothesis)

| Sprint/gate | Dependencies | Stories / outputs | Exit tests |
| --- | --- | --- | --- |
| 1 / M01 | M00 approval, Q-01/03/04 foundation choices | Foundation, auth/RBAC, tenancy, migrations, synthetic fixtures and CI | T-001/002/003/004/022, T-N01/02/09/10 foundation subset |
| 2 | Sprint 1 | Organization/member/vehicle/config administration and initial web/mobile navigation; modules M01/M03/M04/M14 | T-005/006; tenant negative tests on each API |
| 3 | Sprint 2, Q-02 (APPROVED 2026-11-07; policy/contract only) | Contract-frozen scope: `incidents`, `incident_locations`, `change_events`; `listIncidents`, `createIncident`, `getIncident`, `updateIncident`, `transitionIncident`, `listLocations`, `createLocation`. M05 owns incidents; location operations remain M07-owned and are included as the Sprint 3 location slice. Implementation NOT AUTHORIZED. | T-007/009/017 plus tenant/RLS, stale-version, atomic event/audit and timezone guards |
| 4 | Sprint 3 | Human assignments and append-only movement timeline; M06/M09 | T-010/011 including cross-incident FK and no external dispatch |
| 5 | Sprint 4, media dependencies | Field location observations/risk, optional GPS, private quarantined media; M07/M08 | T-012/013, T-N03/06 media/mobile checks |
| 6 | Sprint 5, Q-05/library decision | Encrypted SQLite outbox, push/pull receipts, conflicts, tombstones and resnapshot; M10 | T-014/015/016, T-N04; airplane mode/restart/revocation cases |
| 7 | Sprint 6, Q-07/09 | Counter-based references, report snapshots, submit/review/new revisions, PDF/text export; M11 | T-008/018/019/020, concurrency/privacy/immutability |
| 8 | Sprint 7, infrastructure target | Tenant dashboard/maps, audit views, accessibility, performance/recovery/security hardening; M12/M13 | T-021, T-N01–10 applicable full suite, backup restore |
| 9 | Sprint 8, owners/policy/device access | Sanitized scenario UAT, restore drill, runbooks, training and pilot readiness review | All traceability tests, approved residual-risk record, explicit pilot/deployment decision |

Authentication, authorization, auditing and tests are continuous from sprint 1; sprint 8 is not their first implementation. Each sprint adds contract, tenant-negative and client tests appropriate to its new paths. API contract additions follow design review and keep traceability updated.

## Sequencing and governance

Backend contracts and schema migrations precede dependent UI/sync implementation. Membership/vehicle assignments precede movements; observations precede sync; report snapshots follow stable operational entities. Use feature branches and small reviewed commits; no force push or merge without approval. Re-estimate after staffing and dependency decisions; document dates only after capacity confirmation. Approval of M00 does not authorize M01, deployment or production data use. Escalate destructive actions explicitly.
