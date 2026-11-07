# M01 controlled local development

Branch feat/m01-backend-foundation starts from approved baseline 40b0479b1c8dd5c80e744339253335434b63f6db. User authorization supersedes 21/39 with the committed 22-table/40-operation inventory in [M01 scope](../planning/M01-SCOPE.json).

## M01-A tooling

Node24.16.0 and npm12.2.2 are required. Exact dependency versions are in the workspace manifests; npm cache stays under ignored .cache/npm. TypeScript6.0.3 is selected because typescript-eslint8.72.1 declares <6.1 support; latest TypeScript7 is not silently substituted.

Authorized install command: npm install --no-fund --fetch-retries=0 --fetch-timeout=30000. Installation/native smoke, dependency audit, lint, type checks, format and build must pass before M01-B. See [actual evidence](../testing/M01-VALIDATION.md); no command here implies it already succeeded.

The API rejects public bind hosts, production mode, real mail mode and non-loopback database URLs. API runtime configuration contains restricted runtime/identity URLs only, never migration-owner credentials. `.env.example` contains placeholders; actual local credentials stay ignored and must never be printed or committed. After creating the isolated database and local identity keys, `npm run env:write-local` creates an ignored `.env` from the restricted runtime/identity URLs. It refuses to overwrite an existing file and withholds values from command output.

Commands after a completed installation:

```powershell
node scripts/check-scope.ts
npm run db:generate-local-identity-keys
npm run env:write-local
npm run format
npm run lint
npm run typecheck
npm test
npm run build
npm run format:check
npm run test:integration
npm run start:api
```

The API binds only to `127.0.0.1:3301`; the trusted local web origin is `http://127.0.0.1:5173`. Stop the local process after development checks. WEB credential handoffs use secure cookies and require the documented binding and CSRF checks. The mock delivery adapter accepts only synthetic `.invalid` recipients and is not exposed through a general API response.

No operational incident, web/mobile, reporting/GPS/media or production integration belongs in M01. A framework shell creates no extra health/demo API endpoint beyond the approved inventory.

## Database and later checkpoints

infra/versions.json pins the reviewed PostgreSQL18/PostGIS3.7 image index digest and linux/amd64 platform. The M01 disposable database is created by `node --import tsx scripts/dev-database.ts`; it uses a unique labeled container, a dedicated bridge, a loopback-only published port, and 1 GiB tmpfs storage. Generated local credentials stay in ignored `.cache/m01/database.json`. Do not print, copy into runtime config, or commit this file. Never use unrelated running projects or volumes, broad docker prune/down commands, production connection strings or migration-owner credentials in the API.

Run `npm run db:migrate:local` to apply the reviewed schema and permission catalogue. `npm run db:check-recovery` is restricted to an empty development schema; it checks every foundation table is empty before rollback and then reapplies migrations. The command drops the `app` schema during that check. Never use it against any non-disposable database. If synthetic identity or immutable audit rows exist, the guard refuses rollback; do not bypass it.

M01-A through M01-E execution evidence is recorded in [M01 validation](../testing/M01-VALIDATION.md). Real outbound messaging and production credential issuance remain forbidden.
