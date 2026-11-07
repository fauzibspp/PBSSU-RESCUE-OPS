import { readFileSync } from "node:fs";
import { sql } from "kysely";
import { connectDatabase } from "../apps/api/src/database/connection.js";
import { migrate } from "../apps/api/src/database/migrate.js";

interface DevelopmentDatabaseState {
  ownerUrl: string;
}

const state = JSON.parse(
  readFileSync(new URL("../.cache/m01/database.json", import.meta.url), "utf8"),
) as DevelopmentDatabaseState;
const database = connectDatabase(state.ownerUrl, 1);

try {
  await migrate(database, "down");
  const dropped = await sql<{ exists: string | null }>`
    select to_regnamespace('app')::text as exists
  `.execute(database);
  if (dropped.rows[0]?.exists !== null) {
    throw new Error("Rollback did not remove the foundation schema");
  }
  await migrate(database, "up");
  const restored = await sql<{ count: string }>`
    select count(*)::text as count
    from information_schema.tables
    where table_schema = 'app' and table_type = 'BASE TABLE'
  `.execute(database);
  if (restored.rows[0]?.count !== "22") {
    throw new Error("Recovery did not restore all foundation tables");
  }
  process.stdout.write(
    "Empty-schema migration rollback and recovery passed (22 tables restored)\n",
  );
} catch {
  process.stderr.write(
    "Migration rollback/recovery check failed; inspect database state before retrying.\n",
  );
  process.exitCode = 1;
} finally {
  await database.destroy();
}
