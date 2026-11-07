import { readFileSync } from "node:fs";
import { sql } from "kysely";
import { connectDatabase } from "../apps/api/src/database/connection.js";
import { migrate } from "../apps/api/src/database/migrate.js";

interface State {
  ownerUrl: string;
  databaseName: string;
  scope: string;
  container: string;
}
const state = JSON.parse(
  readFileSync(
    new URL("../.cache/m01-f/database.json", import.meta.url),
    "utf8",
  ),
) as State;
if (
  state.scope !== "m01-f" ||
  !state.databaseName.startsWith("pbssu_m01_f_") ||
  !state.container
)
  throw new Error("Refusing a non-M01-F migration target");
const db = connectDatabase(state.ownerUrl, 1);

async function verify(): Promise<void> {
  const tables = await sql<{
    count: string;
  }>`select count(*)::text count from information_schema.tables where table_schema='app' and table_type='BASE TABLE'`.execute(
    db,
  );
  const keys = await sql<{
    count: string;
  }>`select count(*)::text count from app.permissions`.execute(db);
  const order = await sql<{
    names: string[];
  }>`select array_agg(name order by name) names from migration_meta.kysely_migration`.execute(
    db,
  );
  const rls = await sql<{
    count: string;
  }>`select count(*)::text count from pg_tables where schemaname='app' and rowsecurity`.execute(
    db,
  );
  if (
    tables.rows[0]?.count !== "22" ||
    keys.rows[0]?.count !== "40" ||
    rls.rows[0]?.count !== "9"
  )
    throw new Error("M01-F schema/catalog/RLS verification failed");
  if (
    JSON.stringify(order.rows[0]?.names) !==
    JSON.stringify(["001-foundation", "002-permission-catalog"])
  )
    throw new Error("Migrations are missing or out of order");
}

try {
  await migrate(db, "up");
  await verify();
  const before = await sql<{
    count: string;
  }>`select count(*)::text count from app.permissions`.execute(db);
  try {
    await db.transaction().execute(async (trx) => {
      await sql`insert into app.permissions(code,description,domain) values ('m01f.transaction_probe','probe','TENANT')`.execute(
        trx,
      );
      throw new Error("M01-F intentional transaction rollback");
    });
  } catch (error) {
    if (
      !(error instanceof Error) ||
      error.message !== "M01-F intentional transaction rollback"
    )
      throw error;
  }
  const after = await sql<{
    count: string;
  }>`select count(*)::text count from app.permissions`.execute(db);
  if (before.rows[0]?.count !== after.rows[0]?.count)
    throw new Error("Transaction rollback probe failed");
  let rollbackGuarded = false;
  try {
    await migrate(db, "down");
  } catch (error) {
    rollbackGuarded =
      error instanceof Error && error.message.includes("non-empty state");
    if (!rollbackGuarded) throw error;
  }
  if (!rollbackGuarded)
    throw new Error(
      "Rollback guard did not protect the migration-seeded permission catalogue",
    );
  await verify();
  process.stdout.write(
    "M01-F full up passed: migrations 001+002, 22 tables, 40 permission keys, 9 forced-RLS tenant tables, transaction rollback. Down was safely refused by the existing non-empty-state guard because migration 002 seeds the permission catalogue; schema remained intact.\n",
  );
} catch (error) {
  process.stderr.write(
    `M01-F migration verification failed: ${error instanceof Error ? error.message : "unknown error"}\n`,
  );
  process.exitCode = 1;
} finally {
  await db.destroy();
}
