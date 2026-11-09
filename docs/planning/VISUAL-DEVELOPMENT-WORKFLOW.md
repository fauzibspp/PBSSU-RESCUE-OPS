# Local Visual Development and Browser Testing

**Purpose:** local developer preview and automated browser checks. This is not
an operational UI or authorization to implement operational screens.

## Current implementation status

The accepted repository had no `apps/web` directory or React/Vite frontend.
The `apps/web` workspace introduced by the visual-tooling branch is a clearly
labeled diagnostic preview only. It does not provide sign-in, incident,
assignment, movement, notification, or other operational workflows. It probes
only whether a TCP listener accepts connections on loopback port 3301; it does
not call a health endpoint or any operational API.

## Commands

Use Node 24 and npm 12 as pinned by the repository.

```powershell
# Install the locked workspace dependencies
npm ci

# Create a fresh, uniquely named local PostgreSQL/PostGIS test database
npm run db:sprint4a
# Set this to the state-file path printed by the previous command
$env:PBSSU_TEST_DATABASE_STATE = ".cache/sprint4a/<generated-state-file>.json"
npm run db:migrate:sprint4a

# Start the visible Vite preview (loopback only, http://127.0.0.1:5173)
npm run dev:web

# If the default port is occupied, choose another loopback port
$env:PBSSU_WEB_PORT = "5174"
npm run dev:web

# Build the preview
npm run build:web

# Run the browser suite; Playwright starts Vite if it is not already running
$env:PBSSU_WEB_PORT = "5174" # omit if 5173 is free
npm run test:browser

# Run with a visible Edge window
npm run test:browser:headed

# Open the generated HTML report
npm run test:browser:report
```

Playwright uses the locally installed Microsoft Edge (`msedge`) channel; no
Playwright browser download is required on this machine. Browser tests use
desktop Edge and a Pixel 7-sized Edge viewport. Screenshots are saved to the ignored
`artifacts/browser/` directory; failure screenshots, traces, and videos are
stored under ignored `test-results/`. The HTML report is under ignored
`playwright-report/`.
Video recording is optional: set `$env:PBSSU_CAPTURE_VIDEO = "1"` before
running the browser suite. Playwright then requires its matching ffmpeg
binary; the default workflow does not need video or an ffmpeg download.

## API and database

The API is configured to bind only to `127.0.0.1:3301` and accepts the preview
origin `http://127.0.0.1:5173`. Start it with `npm run dev:api`; it expects the
ignored local `.env` file and an already prepared loopback PostgreSQL database.
If you choose a different preview port and later add browser-to-API requests,
update `TRUSTED_WEB_ORIGIN` in the ignored local `.env` to that loopback origin.
The current diagnostic page makes no browser-to-API request.
The API has no health endpoint, so the preview's API indicator is only a TCP
listener diagnostic. There is no Redis service or Redis dependency configured
in this repository. The checked-in database setup scripts create isolated
test resources, but they do not offer a general-purpose development stack
stop/reset workflow; inspect their unique resource scope before using them.

API unit and contract tests: `npm test -- --run`.
Database-backed integration tests require an explicit isolated Sprint 4-A state
file. Create a fresh state using `npm run db:sprint4a`, retain the generated
file under `.cache/sprint4a/`, then apply the approved migrations with
`npm run db:migrate:sprint4a`. Set
`$env:PBSSU_TEST_DATABASE_STATE = ".cache/sprint4a/<generated-state-file>.json"`
and run `npm run test:integration`. The launcher refuses a missing or
out-of-scope state file and performs a read-only check of the loopback URLs,
pinned database image identity, PostgreSQL/PostGIS versions, migrations,
application table count, and permission count before starting Vitest. It never
creates, resets, migrates, or deletes test databases. These suites remain
separate from browser tests; browser coverage does not bypass API
authentication, MFA, RBAC, RLS, or assignment rules.

If the state file does not match the accepted Sprint 4-A inventory (29 tables,
54 permission keys, migrations 001–009), the launcher stops. Inspect the state
file and database using the project’s documented isolated-resource procedures;
never point the launcher at a production or shared database to make the check
pass.

## Evidence and limitations

Browser tests assert only the diagnostic preview, keyboard focus, responsive
overflow, keyboard focus, API diagnostic success/unavailable states, browser
console errors, uncaught page errors, and failed requests. The API-status
success/unavailable assertions stub only the development TCP diagnostic; they
do not mock or bypass API authentication. The suite does not assert operational
UI behavior because no operational page exists. Do not use real identities,
incident details, or emergency data in screenshots, traces, or videos.
