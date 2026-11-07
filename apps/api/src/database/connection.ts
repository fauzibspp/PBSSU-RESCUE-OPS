import { Kysely, PostgresDialect, sql, type Transaction } from "kysely";
import { Pool } from "pg";

export type DatabaseShape = Record<string, Record<string, unknown>>;
export type Database = Kysely<DatabaseShape>;
export type DatabaseTransaction = Transaction<DatabaseShape>;

export function connectDatabase(
  connectionString: string,
  maximum = 4,
): Database {
  const endpoint = new URL(connectionString);
  if (
    endpoint.protocol !== "postgresql:" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname)
  ) {
    throw new Error("Only isolated local databases are permitted");
  }
  return new Kysely<DatabaseShape>({
    dialect: new PostgresDialect({
      pool: new Pool({
        connectionString,
        max: maximum,
        connectionTimeoutMillis: 5000,
        idleTimeoutMillis: 1000,
      }),
    }),
  });
}

export async function tenantTransaction<Result>(
  database: Database,
  organizationId: string,
  actorUserId: string,
  callback: (transaction: DatabaseTransaction) => Promise<Result>,
): Promise<Result> {
  const identifier =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!identifier.test(organizationId) || !identifier.test(actorUserId)) {
    throw new Error("Invalid trusted database context");
  }
  return database.transaction().execute(async (transaction) => {
    await sql`select set_config('app.organization_id', ${organizationId}, true), set_config('app.actor_user_id', ${actorUserId}, true)`.execute(
      transaction,
    );
    return callback(transaction);
  });
}
