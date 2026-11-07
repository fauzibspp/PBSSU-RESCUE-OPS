# Development setup and M00 environment inspection

PBSSU-DEV-001 v0.1, inspected 2026-11-06. Repository initially contains AGENTS.md, README.md and blueprint only; no application code, dependency manifests, tests, migrations or container definitions. Starting working tree was clean; initial commit inspected: aad2afc (`docs: add PBSSU project blueprint`). M00 documentation uses feature branch `docs/m00-architecture-baseline`; no commit or push performed.

## Observed environment

| Tool | Evidence / limit |
| --- | --- |
| Windows | OS API reports NT 10.0.26200.0; Windows 11 Pro supplied by user. CIM edition query denied; edition not independently verified. |
| Node.js | `node --version`: v24.16.0. |
| npm | `npm --version`: 12.2.2. |
| Git | `git --version`: 2.51.0.windows.1. |
| Docker | CLI 29.7.2 build a7dcaa6; reading user Docker config warned Access denied. Engine/Desktop readiness unverified; no daemon command/container start attempted. |
| Flutter/Dart | Flutter executable on PATH; SDK cached metadata reports Flutter 3.47.9 stable and Dart 3.13.7. SDK commands/doctor not run to avoid cache writes outside repository. |
| VS Code | Executable found on PATH; version/extensions unverified. |
| Python | `python --version`: 3.14.5; stdlib suitable for documentation-only structural checks. |

No dependencies installed; no services started. PostgreSQL/PostGIS, object storage, scanners and iOS build tooling are not validated by this inspection. Exact backend/library/image compatibility remains Q-04. Access limitations are inspection findings, not successful runtime checks.

## Future setup after M01 approval

Confirm Q-03/Q-04, pin package manager and reviewed dependency versions, then create application workspace and env templates. Secrets must stay in ignored local files or an approved secret store; only placeholder names belong in templates. Keep migration/runtime DB roles separate. Use isolated local Docker volumes and synthetic tenants; bind local services narrowly. Never copy production data or real operational reports into development.

Planned configuration categories: database endpoint/runtime and migration credentials, token signing/issuer/audience, storage bucket/endpoint/credentials, encryption key references, scan/render worker settings and redacted observability. Values are never included in this baseline. Future setup guide must supply exact commands once manifests and container definitions exist; do not pretend `npm test` or Docker Compose is available now.

After approval, verify Docker engine connectivity and SDK doctor with permission for any required external cache changes. Windows supports Android/web/backend development; native iOS compilation/signing requires macOS/Xcode or an approved macOS CI environment. Deployment remains a separate decision.
