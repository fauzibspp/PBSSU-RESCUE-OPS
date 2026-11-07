import { randomBytes } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { Pool, escapeLiteral } from "pg";
import { setTimeout as pause } from "node:timers/promises";

const state = new URL("../.cache/m01/database.json", import.meta.url);
const image =
  "postgis/postgis:18-3.7@sha256:440bdd14e3edccfce04d080d8a1a0cbae5763fa16a1c4172bff83530828461de";

function docker(argumentsList: string[], environment = process.env): string {
  return execFileSync(
    "docker",
    ["--context", "desktop-linux", ...argumentsList],
    { encoding: "utf8", env: environment, stdio: ["ignore", "pipe", "pipe"] },
  ).trim();
}

async function setup(): Promise<void> {
  if (existsSync(state)) {
    throw new Error("Existing development state requires review; not modified");
  }
  const endpoint = docker([
    "context",
    "inspect",
    "desktop-linux",
    "--format",
    "{{.Endpoints.docker.Host}}",
  ]);
  if (!endpoint.startsWith("npipe:")) {
    throw new Error("Expected local Docker Desktop named-pipe endpoint");
  }
  const suffix = randomBytes(6).toString("hex");
  const name = `pbssu-m01-${suffix}`;
  const databaseName = `pbssu_m01_${suffix}`;
  const network = `${name}-loopback`;
  const bootstrapPassword = randomBytes(32).toString("base64url");
  const ownerPassword = randomBytes(32).toString("base64url");
  const runtimePassword = randomBytes(32).toString("base64url");
  const identityPassword = randomBytes(32).toString("base64url");
  const existing = spawnSync(
    "docker",
    ["--context", "desktop-linux", "container", "inspect", name],
    { stdio: "ignore" },
  );
  if (existing.status === 0) {
    throw new Error("Container namespace already exists");
  }
  docker(["pull", "--platform", "linux/amd64", image]);
  docker(["network", "create", "--label", "com.pbssu.scope=m01", network]);
  const identifier = docker(
    [
      "run",
      "--detach",
      "--name",
      name,
      "--platform",
      "linux/amd64",
      "--label",
      "com.pbssu.scope=m01",
      "--label",
      `com.pbssu.instance=${suffix}`,
      "--network",
      network,
      "--publish",
      "127.0.0.1::5432",
      "--tmpfs",
      "/var/lib/postgresql:rw,nosuid,nodev,size=1073741824",
      "--env",
      "POSTGRES_USER=pbssu_m01_bootstrap",
      "--env",
      `POSTGRES_DB=${databaseName}`,
      "--env",
      "POSTGRES_PASSWORD",
      image,
    ],
    { ...process.env, POSTGRES_PASSWORD: bootstrapPassword },
  );
  const mapping = JSON.parse(
    docker([
      "inspect",
      "--format",
      "{{json .NetworkSettings.Ports}}",
      identifier,
    ]),
  ) as Record<string, { HostIp: string; HostPort: string }[]>;
  const binding = mapping["5432/tcp"]?.[0];
  if (!binding || binding.HostIp !== "127.0.0.1") {
    throw new Error("Loopback-only database binding not verified");
  }
  const url = (user: string, password: string) =>
    `postgresql://${user}:${password}@127.0.0.1:${binding.HostPort}/${databaseName}`;
  const bootstrap = new Pool({
    connectionString: url("pbssu_m01_bootstrap", bootstrapPassword),
    connectionTimeoutMillis: 2000,
    max: 1,
  });
  let ready = false;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      await bootstrap.query("select 1");
      ready = true;
      break;
    } catch {
      await pause(1000);
    }
  }
  if (!ready) {
    await bootstrap.end();
    throw new Error("New database did not become ready");
  }
  for (const [role, password] of [
    ["pbssu_m01_owner", ownerPassword],
    ["pbssu_m01_runtime", runtimePassword],
    ["pbssu_m01_identity", identityPassword],
  ]) {
    if (!role || !password) {
      throw new Error("Missing generated local role configuration");
    }
    await bootstrap.query(
      `create role ${role} login nosuperuser nocreatedb nocreaterole noinherit nobypassrls password ${escapeLiteral(password)}`,
    );
  }
  await bootstrap.query(
    `alter database ${databaseName} owner to pbssu_m01_owner`,
  );
  const version = await bootstrap.query<{ version: string; postgis: string }>(
    "select current_setting('server_version') as version, postgis_lib_version() as postgis",
  );
  if (
    !version.rows[0]?.version.startsWith("18.") ||
    !version.rows[0]?.postgis.startsWith("3.7")
  ) {
    throw new Error("Unexpected PostgreSQL/PostGIS runtime version");
  }
  await bootstrap.end();
  mkdirSync(new URL("../.cache/m01/", import.meta.url), { recursive: true });
  writeFileSync(
    state,
    JSON.stringify({
      instance: suffix,
      container: identifier,
      name,
      network,
      databaseName,
      image,
      ownerUrl: url("pbssu_m01_owner", ownerPassword),
      runtimeUrl: url("pbssu_m01_runtime", runtimePassword),
      identityUrl: url("pbssu_m01_identity", identityPassword),
      serverVersion: version.rows[0].version,
      postgisVersion: version.rows[0].postgis,
      createdForM01: true,
      storage: "tmpfs",
    }),
    { mode: 0o600, flag: "wx" },
  );
  process.stdout.write(
    "Created isolated loopback-only M01 database; local credentials stored privately, never printed\n",
  );
}

setup().catch(() => {
  process.stderr.write(
    "M01 database setup failed; existing resources were not modified. Inspect the new M01 namespace before retrying.\n",
  );
  process.exitCode = 1;
});
