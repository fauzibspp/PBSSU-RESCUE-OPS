import { sql } from "kysely";
import { Migrator } from "kysely/migration";
import type { Database } from "./connection.js";
import * as foundation from "./migrations/001-foundation.js";
import * as permissions from "./migrations/002-permission-catalog.js";

export async function migrate(
  database: Database,
  direction: "up" | "down" = "up",
): Promise<void> {
  const target = await sql<{
    name: string;
    actor: string;
  }>`select current_database() as name, current_user as actor`.execute(
    database,
  );
  if (
    !target.rows[0]?.name.startsWith("pbssu_m01_") ||
    target.rows[0]?.actor !== "pbssu_m01_owner"
  ) {
    throw new Error("Migration target must be the isolated M01 owner database");
  }
  await sql`create schema if not exists migration_meta`.execute(database);
  const migrator = new Migrator({
    db: database,
    migrationTableSchema: "migration_meta",
    provider: {
      getMigrations: async () => ({
        "001-foundation": foundation,
        "002-permission-catalog": permissions,
      }),
    },
  });
  if (direction === "down") {
    const tables = await sql<{ name: string }>`
      select tablename as name from pg_tables where schemaname = 'app'
    `.execute(database);
    for (const table of tables.rows) {
      if (!/^[a-z_]+$/.test(table.name)) {
        throw new Error("Rollback found an unexpected table identifier");
      }
      const populated = await sql<{ has_rows: boolean }>`
        select exists(select 1 from app.${sql.raw(`"${table.name}"`)} limit 1) as has_rows
      `.execute(database);
      if (populated.rows[0]?.has_rows) {
        throw new Error(
          "Rollback refuses non-empty state; explicit review required",
        );
      }
    }
  }
  const result =
    direction === "up"
      ? await migrator.migrateToLatest()
      : await migrator.migrateDown();
  if (result.error) {
    throw new Error("Reviewed local migration failed");
  }
}
