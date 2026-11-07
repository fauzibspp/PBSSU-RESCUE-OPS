import { sql } from "kysely";
import type { Database } from "../connection.js";

export async function up(database: Database): Promise<void> {
  await sql
    .raw(
      `
    do $migration$
    declare old_constraint name;
    begin
      select conname into old_constraint from pg_constraint
      where conrelid='app.audit_logs'::regclass and contype='c'
        and pg_get_constraintdef(oid) like '%jsonb_typeof(metadata)%';
      if old_constraint is null then
        raise exception 'Expected audit metadata constraint was not found';
      end if;
      execute format('alter table app.audit_logs drop constraint %I',old_constraint);
    end
    $migration$;
    alter table app.audit_logs add constraint audit_logs_metadata_check check (
      (jsonb_typeof(metadata)='object' and metadata='{}'::jsonb)
      or (
        action='transitionIncident' and resource_type='INCIDENT' and result='SUCCESS'
        and jsonb_typeof(metadata)='object'
        and metadata=jsonb_build_object('cancellation_reason',metadata->'cancellation_reason')
        and metadata ? 'cancellation_reason'
        and jsonb_typeof(metadata->'cancellation_reason')='object'
        and metadata->'cancellation_reason' = jsonb_build_object(
          'version',metadata->'cancellation_reason'->'version',
          'algorithm',metadata->'cancellation_reason'->'algorithm',
          'key_ref',metadata->'cancellation_reason'->'key_ref',
          'ciphertext',metadata->'cancellation_reason'->'ciphertext'
        )
        and metadata->'cancellation_reason' ?& array['version','algorithm','key_ref','ciphertext']
        and metadata->'cancellation_reason'->>'version'='1'
        and metadata->'cancellation_reason'->>'algorithm'='A256GCM'
        and metadata->'cancellation_reason'->>'key_ref' ~ '^[a-f0-9]{24}$'
        and length(metadata->'cancellation_reason'->>'ciphertext') between 40 and 5400
        and metadata->'cancellation_reason'->>'ciphertext' ~ '^[A-Za-z0-9_-]+[.][A-Za-z0-9_-]+[.][A-Za-z0-9_-]+$'
        and length(split_part(metadata->'cancellation_reason'->>'ciphertext','.',1))=16
        and length(split_part(metadata->'cancellation_reason'->>'ciphertext','.',2))=22
      )
    );
  `,
    )
    .execute(database);
}

export async function down(_database: Database): Promise<void> {
  throw new Error("Protected cancellation audit migration is forward-only");
}
