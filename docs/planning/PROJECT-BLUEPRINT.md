# PBSSU RESCUE OPS — PROJECT BLUEPRINT

**Document ID:** PBSSU-BP-001  
**Version:** 1.0  
**Status:** Proposed baseline for M00  
**Project Type:** Multi-Tenant Volunteer Fire & Rescue Operations Management System  
**Pilot Organization:** Pasukan Bomba Sukarela Saujana Utama (PBSSU)

## 1. Project Vision

Develop a secure, maintainable and offline-capable operational management platform for multiple volunteer fire and rescue organizations in Malaysia.

Each organization must manage its own members, vehicles, incidents, field observations, reports and audit records without unauthorized access to another organization's information.

The system supports volunteer emergency operations. It does not replace official emergency communication, dispatch authority or government incident-management systems.

## 2. Approved Architectural Direction

- Mobile: Flutter and Dart for Android and iOS.
- Web Command Center: React, TypeScript and Vite.
- Backend: NestJS modular monolith.
- Database: PostgreSQL with PostGIS.
- Offline mobile database: SQLite.
- Media: Private S3-compatible object storage.
- API: REST with OpenAPI 3.1.
- Authentication: Secure token-based authentication.
- Authorization: Tenant-scoped Role-Based Access Control (RBAC).
- Development: Windows 11, VS Code, Docker Desktop and Git.
- Deployment: Containerized backend with managed or self-hosted infrastructure to be decided.

Use a shared database with tenant-scoped operational records. Enforce organization isolation through application authorization, database constraints, PostgreSQL Row-Level Security and automated security tests.

## 3. Organization Model

The platform supports multiple volunteer fire brigades.

A user may belong to multiple organizations, with different roles in each organization.

Each incident belongs to exactly one organization. Operational information must never be shared across organizations without explicit authorization and an approved sharing mechanism.

Platform administrators must not automatically receive unrestricted access to sensitive operational content.

## 4. Core Modules

- M01: Organization Management
- M02: Identity, Membership and RBAC
- M03: Personnel Management
- M04: Vehicle Management
- M05: Incident Management
- M06: Dispatch and Assignment
- M07: Multi-Location Field Monitoring
- M08: Situation Updates, GPS and Media
- M09: Vehicle Movement Logs
- M10: Offline Data Synchronization
- M11: Report Generation and Approval
- M12: Web Command Center
- M13: Audit Logging and Security
- M14: Organization Configuration

The implementation order must follow dependencies rather than module numbering.

## 5. User Roles

### Platform Super Admin

Manages platform-level configuration and organization onboarding.

### Organization Admin

Manages members, vehicles, organization settings and authorized operational records.

### Control Room Operator

Creates incidents, manages dispatch and monitors operational progress.

### Incident Commander

Manages assignments, validates operational information, closes incidents and approves reports.

### Field Responder

Views assigned incidents and submits authorized field observations, location information and media.

### Read-Only Auditor

Reviews permitted operational records, reports and audit history without modifying them.

All permissions must be enforced by the backend.

## 6. Incident Lifecycle

DRAFT → OPEN → DISPATCHED → ON_SCENE → MONITORING → RETURNING → COMPLETED → CLOSED

Cancellation is permitted only through authorized transitions with an audit record.

Incident completion and report approval are separate workflows.

Reports follow:

DRAFT → SUBMITTED → APPROVED or REJECTED

Approved reports are immutable. Corrections require a new version.

## 7. Core Data Entities

- organizations
- users
- memberships
- roles
- permissions
- role_permissions
- vehicles
- incidents
- incident_locations
- incident_personnel
- incident_vehicles
- movement_logs
- situation_updates
- incident_media
- agencies
- incident_agencies
- incident_victims
- reports
- report_approvals
- audit_logs
- sync_operations
- organization_settings
- notification_deliveries

Use UUID identifiers, UTC timestamps, appropriate foreign keys, unique constraints and database migrations.

Every tenant-owned table must support reliable tenant isolation.

## 8. Functional Requirements

FR-001: Register and manage organizations.

FR-002: Authenticate users securely.

FR-003: Support multiple organization memberships.

FR-004: Manage organization-specific roles and permissions.

FR-005: Register and manage members.

FR-006: Register and manage vehicles.

FR-007: Create and update incidents.

FR-008: Generate unique report numbers per organization and year.

FR-009: Record multiple locations under one incident.

FR-010: Assign responders and vehicles.

FR-011: Record departure, arrival, return and other authorized movement events.

FR-012: Record field observations, timestamps and risk assessments.

FR-013: Capture photos and optional GPS coordinates.

FR-014: Support offline field data entry.

FR-015: Synchronize offline records without duplication.

FR-016: Detect and resolve conflicting updates.

FR-017: Close incidents through an authorized workflow.

FR-018: Generate structured operational reports.

FR-019: Approve and version reports.

FR-020: Export approved reports to PDF and WhatsApp-compatible text.

FR-021: Provide organization-specific operational dashboards.

FR-022: Maintain audit trails for important actions.

## 9. Non-Functional Requirements

- HTTPS for all production API traffic.
- Strong authentication and secure password hashing.
- Strict tenant isolation.
- Encrypted storage of sensitive local mobile data.
- Private media storage with authorization checks.
- Idempotent synchronization operations.
- Version-based conflict detection.
- Daily backups and tested restoration procedures.
- Malaysian Bahasa Melayu as the primary UI language.
- Accessible mobile-first interface.
- Appropriate monitoring, logging and error handling.

Proposed performance and availability targets must be validated during M00 and testing.

## 10. Offline Synchronization

Mobile field records are stored locally in SQLite.

Each locally created record receives a UUID. Each synchronization operation receives a unique operation identifier.

Use a durable local outbox, server-side idempotency and version-based conflict detection.

New situation updates should normally be append-only.

Do not use unconditional last-write-wins for incident status, dispatch assignments or report approvals.

Offline records are not considered server-confirmed until acknowledged.

Report approval requires an authenticated online operation.

## 11. Reporting Requirements

Generate reports containing:

- Organization name
- Report reference
- Incident category
- Date and time
- Source of incident information
- Personnel involved
- Vehicles involved
- Operational movement timeline
- Monitoring locations
- Field observations
- Agencies involved, if any
- Victim information, if applicable and authorized
- Incident outcome
- Approver and approval timestamp

Generate PDF and WhatsApp-compatible text from approved report data.

Do not claim a report was delivered to or acknowledged by an external agency unless delivery and acknowledgement are actually verified.

## 12. Reference Operational Scenario

Use a sanitized example based on a flood-monitoring operation dated 5 November 2026.

Incident category: Flood Monitoring.

Operational area: Saujana Utama, Saujana Perdana and surrounding locations.

Personnel: Three responders.

Vehicle: One volunteer fire and rescue vehicle.

Departure time: 17:00 local time.

Arrival time: 17:07 local time.

Monitoring involves six locations.

The example should demonstrate incident creation, personnel assignment, vehicle movement, multi-location observations and report generation.

Use fictional names, phone numbers and other personal details in test fixtures.

Do not include real banking information or private contact details.

## 13. Security Requirements

- Never trust tenant identifiers from client request bodies.
- Validate membership and permissions on every protected operation.
- Use PostgreSQL Row-Level Security where appropriate.
- Prevent cross-tenant foreign key relationships.
- Protect media uploads and downloads.
- Never expose secrets in source control.
- Maintain audit records for sensitive actions.
- Support session revocation.
- Require explicit approval before deployment.
- Never trigger real emergency dispatch automatically.

## 14. MVP Scope

The MVP includes:

- Multi-organization onboarding
- Authentication and RBAC
- Personnel and vehicle records
- Incident lifecycle
- Dispatch and assignments
- Multi-location field monitoring
- Media uploads
- Offline synchronization
- Report approval and PDF generation
- Command Center dashboard
- Audit logging

Exclude AI predictions, real-time vehicle tracking, official agency integrations and public emergency alerting from the initial MVP.

## 15. Proposed Delivery Roadmap

Sprint 1: Foundation, authentication and tenant architecture.

Sprint 2: Organization administration, members and vehicles.

Sprint 3: Incident management.

Sprint 4: Dispatch, assignments and movement logs.

Sprint 5: Field monitoring, GPS and media.

Sprint 6: Offline synchronization.

Sprint 7: Report generation and approval.

Sprint 8: Dashboard, security and performance hardening.

Sprint 9: User acceptance testing and PBSSU pilot preparation.

Estimated baseline: 18 weeks for a suitably staffed development team. Re-estimate after confirming actual team capacity.

## 16. M00 Documentation Deliverables

Generate and cross-check:

1. Software Requirements Specification.
2. System Architecture Specification.
3. Database Schema and ERD.
4. OpenAPI 3.1 Specification.
5. UI/UX and Screen Flow Specification.
6. Implementation Plan and Sprint Backlog.
7. Security Threat Model.
8. Test Strategy.
9. Data Dictionary.
10. Architecture Decision Records.
11. Development Setup Guide.
12. Definition of Done.
13. Requirements Traceability Matrix.

All assumptions and unresolved decisions must be explicitly documented.

## 17. Agent Development Constraints

Follow the repository's AGENTS.md.

For M00, generate documentation only.

Do not scaffold application code, install new dependencies, start containers, deploy services, modify external systems or use real personal data.

Do not silently change the approved technology stack or architectural direction.

Flag ambiguous requirements rather than inventing policy or operational authority.

Stop after completing M00 and wait for explicit approval before proceeding to M01.
