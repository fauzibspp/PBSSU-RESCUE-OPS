import { readFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

interface Sprint4aState {
  scope: string;
  instance: string;
  dockerScope: string;
  container: string;
  name: string;
  network: string;
  databaseName: string;
  image: string;
  ownerUrl: string;
  runtimeUrl: string;
  identityUrl: string;
}

const image =
  "postgis/postgis:18-3.7@sha256:440bdd14e3edccfce04d080d8a1a0cbae5763fa16a1c4172bff83530828461de";
const migrations = [
  "001-foundation",
  "002-permission-catalog",
  "003-vehicles",
  "004-incidents",
  "005-incident-permissions",
  "006-protected-cancellation-audit",
  "007-location-permissions",
  "008-sprint4-permissions",
  "009-sprint4-assignment-movement",
];

export function validateIntegrationState(
  state: unknown,
  projectRoot: string,
  stateFile: string,
): asserts state is Sprint4aState {
  if (!state || typeof state !== "object") {
    throw new Error("Invalid isolated test database state");
  }
  const value = state as Partial<Sprint4aState>;
  const file = resolve(stateFile);
  const cacheRoot = resolve(projectRoot, ".cache", "sprint4a") + sep;
  if (
    !file.startsWith(cacheRoot) ||
    !file.toLowerCase().endsWith(".json") ||
    value.scope !== "sprint4a" ||
    !/^[a-f0-9]{12}$/.test(value.instance ?? "") ||
    value.dockerScope !== `sprint4a-${value.instance}` ||
    value.name !== `pbssu-sprint4a-${value.instance}` ||
    value.network !== `${value.name}-isolated` ||
    (value.container !== value.name &&
      !/^[a-f0-9]{64}$/.test(value.container ?? "")) ||
    value.databaseName !== `pbssu_m01_sprint4a_${value.instance}` ||
    value.image !== image
  ) {
    throw new Error(
      "Refusing test database outside the isolated Sprint 4-A scope",
    );
  }

  for (const [key, expectedUser] of [
    ["ownerUrl", "pbssu_m01_owner"],
    ["runtimeUrl", "pbssu_m01_runtime"],
    ["identityUrl", "pbssu_m01_identity"],
  ] as const) {
    let url: URL;
    try {
      url = new URL(value[key] ?? "");
    } catch {
      throw new Error(
        "Invalid isolated test database connection configuration",
      );
    }
    if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
      throw new Error("Refusing non-PostgreSQL test database configuration");
    }
    if (
      url.hostname !== "127.0.0.1" ||
      decodeURIComponent(url.username) !== expectedUser ||
      decodeURIComponent(url.password).length < 32 ||
      url.pathname !== `/${value.databaseName}` ||
      url.search
    ) {
      throw new Error(
        "Refusing non-loopback or mismatched test database configuration",
      );
    }
  }
}

async function verifyDatabase(state: Sprint4aState): Promise<void> {
  const pool = new Pool({
    connectionString: state.ownerUrl,
    max: 1,
    connectionTimeoutMillis: 3000,
    statement_timeout: 5000,
    application_name: "pbssu-integration-preflight-readonly",
  });
  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN READ ONLY");
      const identity = await client.query<{
        database_name: string;
        server_version: string;
        postgis_version: string;
      }>(
        "select current_database() database_name, current_setting('server_version') server_version, postgis_lib_version() postgis_version",
      );
      const counts = await client.query<{
        table_count: string;
        permission_count: string;
        migrations: string[];
      }>(`select
        (select count(*)::text from information_schema.tables where table_schema='app' and table_type='BASE TABLE') table_count,
        (select count(*)::text from app.permissions) permission_count,
        (select array_agg(name order by name) from migration_meta.kysely_migration) migrations`);
      const actual = identity.rows[0];
      const inventory = counts.rows[0];
      if (
        actual?.database_name !== state.databaseName ||
        !actual.server_version.startsWith("18.") ||
        !actual.postgis_version.startsWith("3.7.") ||
        inventory?.table_count !== "29" ||
        inventory.permission_count !== "54" ||
        JSON.stringify(inventory.migrations) !== JSON.stringify(migrations)
      ) {
        throw new Error(
          "Sprint 4-A schema inventory does not match the expected test baseline",
        );
      }
      await client.query("ROLLBACK");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

async function main(): Promise<void> {
  const projectRoot = fileURLToPath(new URL("../", import.meta.url));
  const stateFile = process.env.PBSSU_TEST_DATABASE_STATE;
  if (!stateFile) {
    throw new Error(
      "Set PBSSU_TEST_DATABASE_STATE to an isolated Sprint 4-A state file",
    );
  }
  const absoluteStateFile = resolve(projectRoot, stateFile);
  const state = JSON.parse(readFileSync(absoluteStateFile, "utf8")) as unknown;
  validateIntegrationState(state, projectRoot, absoluteStateFile);
  await verifyDatabase(state);

  process.stdout.write(
    "Integration database preflight passed (read-only; isolated Sprint 4-A inventory).\n",
  );
  const result = spawnSync(
    process.execPath,
    [
      "node_modules/vitest/vitest.mjs",
      "run",
      "--config",
      "vitest.integration.config.ts",
      ...process.argv.slice(2),
    ],
    {
      cwd: projectRoot,
      env: {
        ...process.env,
        NODE_ENV: "test",
        PBSSU_TEST_DATABASE_STATE: absoluteStateFile,
      },
      stdio: "inherit",
    },
  );
  if (result.error)
    throw new Error("Could not start the integration test runner");
  process.exitCode = result.status ?? 1;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "unknown error";
    process.stderr.write(
      `Integration tests not started: ${message}. No credentials were displayed.\n`,
    );
    process.exitCode = 1;
  });
}
