import { readFileSync } from "node:fs";
import { connectDatabase } from "../apps/api/src/database/connection.js";
import { migrate } from "../apps/api/src/database/migrate.js";

interface DevelopmentDatabaseState {
  ownerUrl: string;
  container: string;
  databaseName: string;
}

const state = JSON.parse(
  readFileSync(new URL("../.cache/m01/database.json", import.meta.url), "utf8"),
) as DevelopmentDatabaseState;
const database = connectDatabase(state.ownerUrl, 1);

try {
  await migrate(database);
  process.stdout.write(
    `Applied M01 foundation migration to ${state.databaseName} in ${state.container}\n`,
  );
} catch {
  process.stderr.write(
    "M01 migration failed; inspect database metadata before retrying.\n",
  );
  process.exitCode = 1;
} finally {
  await database.destroy();
}
