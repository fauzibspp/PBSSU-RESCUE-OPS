import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { Pool, escapeLiteral } from "pg";
import { setTimeout as pause } from "node:timers/promises";

const instancePrefix = process.env.PBSSU_SPRINT2_INSTANCE_PREFIX ?? "sprint2";
if (!/^sprint2(?:f)?$/.test(instancePrefix))
  throw new Error("Invalid Sprint 2 disposable instance prefix");
const cache = new URL(`../.cache/${instancePrefix}/`, import.meta.url);
const stateFile = new URL(
  `../.cache/${instancePrefix}/database.json`,
  import.meta.url,
);
const image =
  "postgis/postgis:18-3.7@sha256:440bdd14e3edccfce04d080d8a1a0cbae5763fa16a1c4172bff83530828461de";

function docker(args: string[], env = process.env): string {
  return execFileSync("docker", ["--context", "desktop-linux", ...args], {
    encoding: "utf8",
    env,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

async function main(): Promise<void> {
  const containers = docker([
    "ps",
    "-a",
    "--filter",
    `label=com.pbssu.scope=${instancePrefix}`,
    "--format",
    "{{.Names}}",
  ]);
  const networks = docker([
    "network",
    "ls",
    "--filter",
    `label=com.pbssu.scope=${instancePrefix}`,
    "--format",
    "{{.Name}}",
  ]);
  if (containers || networks || (await import("node:fs")).existsSync(stateFile))
    throw new Error(
      "Sprint 2 disposable namespace already exists; refusing reuse",
    );

  const suffix = randomBytes(6).toString("hex");
  const name = `pbssu-sprint2-${suffix}`;
  const network = `${name}-isolated`;
  const databaseName = `pbssu_m01_${instancePrefix}_${suffix}`;
  const bootstrap = randomBytes(32).toString("base64url");
  const owner = randomBytes(32).toString("base64url");
  const runtime = randomBytes(32).toString("base64url");
  const identity = randomBytes(32).toString("base64url");

  docker(["image", "inspect", image]);
  docker([
    "network",
    "create",
    "--label",
    `com.pbssu.scope=${instancePrefix}`,
    network,
  ]);
  const containerId = docker(
    [
      "run",
      "--detach",
      "--pull=never",
      "--name",
      name,
      "--platform",
      "linux/amd64",
      "--label",
      `com.pbssu.scope=${instancePrefix}`,
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
    { ...process.env, POSTGRES_PASSWORD: bootstrap },
  );

  const ports = JSON.parse(
    docker([
      "inspect",
      "--format",
      "{{json .NetworkSettings.Ports}}",
      containerId,
    ]),
  ) as Record<string, { HostIp: string; HostPort: string }[]>;
  const binding = ports["5432/tcp"]?.[0];
  if (!binding || binding.HostIp !== "127.0.0.1")
    throw new Error("Sprint 2 test database is not loopback-only");
  const url = (user: string, password: string) =>
    `postgresql://${user}:${password}@127.0.0.1:${binding.HostPort}/${databaseName}`;
  const pool = new Pool({
    connectionString: url("pbssu_m01_bootstrap", bootstrap),
    max: 1,
    connectionTimeoutMillis: 2000,
  });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      try {
        await pool.query("select 1");
        ready = true;
        break;
      } catch {
        await pause(1000);
      }
    }
    if (!ready) throw new Error("Sprint 2 test database did not become ready");
    for (const [role, password] of [
      ["pbssu_m01_owner", owner],
      ["pbssu_m01_runtime", runtime],
      ["pbssu_m01_identity", identity],
    ]) {
      await pool.query(
        `create role ${role} login nosuperuser nocreatedb nocreaterole noinherit nobypassrls password ${escapeLiteral(password)}`,
      );
    }
    await pool.query(`alter database ${databaseName} owner to pbssu_m01_owner`);
    const versions = await pool.query<{ server: string; postgis: string }>(
      "select current_setting('server_version') server, postgis_lib_version() postgis",
    );
    if (
      !versions.rows[0]?.server.startsWith("18.") ||
      !versions.rows[0]?.postgis.startsWith("3.7")
    )
      throw new Error("Unexpected PostgreSQL/PostGIS runtime version");
    mkdirSync(cache, { recursive: true });
    writeFileSync(
      stateFile,
      JSON.stringify({
        scope: instancePrefix,
        instance: suffix,
        container: containerId,
        name,
        network,
        databaseName,
        image,
        ownerUrl: url("pbssu_m01_owner", owner),
        runtimeUrl: url("pbssu_m01_runtime", runtime),
        identityUrl: url("pbssu_m01_identity", identity),
        serverVersion: versions.rows[0].server,
        postgisVersion: versions.rows[0].postgis,
        storage: "tmpfs",
      }),
      { mode: 0o600, flag: "wx" },
    );
    process.stdout.write(
      `Created isolated Sprint 2 database ${databaseName}; credentials withheld.\n`,
    );
  } finally {
    await pool.end();
  }
}

main().catch(() => {
  process.stderr.write(
    "Sprint 2 database setup failed; inspect only the unique Sprint 2 namespace before retrying.\n",
  );
  process.exitCode = 1;
});
