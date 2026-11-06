# PBSSU RESCUE OPS — AGENT INSTRUCTIONS

## Mission
Build a secure, maintainable, multi-tenant volunteer fire
and rescue operations management platform.

## Technology
- Mobile: Flutter and Dart
- Web: React, TypeScript and Vite
- Backend: NestJS and TypeScript
- Database: PostgreSQL with PostGIS
- Offline mobile storage: SQLite
- Development environment: Windows 11 and Docker

## Architecture Rules
1. Follow approved project documentation.
2. Use a modular monolith for the MVP.
3. Enforce tenant isolation on every operational resource.
4. Never trust organization_id from request bodies.
5. Use migrations for all database changes.
6. Use DTO validation and explicit authorization.
7. Use UUIDs for primary identifiers.
8. Store timestamps in UTC.
9. Keep secrets outside source control.
10. Use OpenAPI as the API contract.

## Safety Rules
- Do not expose victim or responder private data.
- Do not simulate official agency acknowledgement.
- Do not auto-dispatch emergency resources.
- Do not delete production data.
- Do not deploy or publish without approval.
- Never bypass authentication or tenant isolation.

## Development Workflow
1. Read the relevant docs before coding.
2. Present a short implementation plan.
3. Work on one milestone at a time.
4. Write or update automated tests.
5. Run lint, type checks and relevant tests.
6. Report changed files and test results.
7. Stop and request approval for destructive actions.
8. Never claim a test passed unless it was executed.

## Git Rules
- Use feature branches.
- Keep commits small and descriptive.
- Never commit secrets or real personal data.
- Do not force push.
- Do not merge into main without approval.

## Definition of Done
A task is complete only when its acceptance criteria
are met, relevant tests pass, documentation is updated,
and the implementation summary is provided.
