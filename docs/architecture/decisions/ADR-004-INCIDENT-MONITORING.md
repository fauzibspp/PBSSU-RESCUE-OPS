# ADR-004: Incident lifecycle and multiple locations

Date 2026-11-06; Q-02 policy approved by Project Owner 2026-11-07. Status: lifecycle/policy approved; implementation is not authorized by that policy approval.

Context: one operation can monitor several places, with personnel, vehicle movements and independent evidence.

Decision: one tenant-owned incident with incident_locations; explicit guarded lifecycle through DRAFT, OPEN, DISPATCHED, ON_SCENE, MONITORING, RETURNING, COMPLETED, CLOSED, plus ON_SCENE → RETURNING. Q02-1 through Q02-9 are approved in [DECISION-REGISTER.md](../../planning/DECISION-REGISTER.md). Cancellation is allowed only from DRAFT/OPEN with reason and Commander authorization. Completion requires outcome; closure requires Commander review; no MVP reopening. Dispatch-dependent transitions wait for Sprint 4 assignment/arrival evidence. Assignments remain human-authorized internal records; updates/movements append; corrections preserve originals.

Alternatives: one incident per observation loses shared timeline; arbitrary status editing destroys lifecycle evidence.

Consequences: location/assignment references must match incident and tenant. Completion is separate from report approval. No auto-dispatch or invented agency acknowledgement. The Q-02 policy is approved, while Sprint 3 code is not authorized. T-007/009/010/011/017 validate behavior when their respective increments are approved.

Owner-approved additions (2026-11-07): cancellation reasons are restricted; full values are available to authorized Commander/Operator incident projections, while responder projections are minimized and Org Admin/Platform Super Admin have no automatic access. Auditor access requires a specifically authorized audit view; current `listAuditLogs` is redacted and does not provide it, so no API/permission expansion is made and that access is deferred. Reasons are excluded from generic logs, public telemetry, unauthorized notifications and unredacted errors. Events/audit are append-only through ordinary APIs, corrections append new events, and Sprint 3 has no purge/scheduler. Q-05 remains open; this does not approve indefinite retention.
