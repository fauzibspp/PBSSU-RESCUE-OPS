import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { sql } from "kysely";
import { loadEnvironment } from "../config.js";
import {
  connectDatabase,
  tenantTransaction,
  type DatabaseTransaction,
} from "../database/connection.js";
import { IdentityService } from "../identity/identity.service.js";
import { protectCancellationReason } from "../security/protected-audit-metadata.js";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const categories = new Set(["FLOOD_MONITORING", "FIRE", "RESCUE", "OTHER"]);
const states = new Set([
  "DRAFT",
  "OPEN",
  "DISPATCHED",
  "ON_SCENE",
  "MONITORING",
  "RETURNING",
  "COMPLETED",
  "CLOSED",
  "CANCELLED",
]);
const mfaRoles = new Set([
  "ORGANIZATION_ADMIN",
  "CONTROL_ROOM_OPERATOR",
  "INCIDENT_COMMANDER",
  "READ_ONLY_AUDITOR",
]);
const incidentColumns = sql.raw(
  "id,version,created_at,organization_id,title,category,status,occurred_at,source_kind",
);
export interface IncidentRecord {
  id: string;
  version: number;
  created_at: Date;
  organization_id: string;
  title: string;
  category: string;
  status: string;
  occurred_at: Date;
  source_kind: string;
}

function bad(): never {
  throw new BadRequestException("Invalid request");
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return bad();
  return value as Record<string, unknown>;
}
function id(value: unknown): string {
  if (typeof value !== "string" || !uuidPattern.test(value)) return bad();
  return value;
}
function bounded(value: unknown, min: number, max: number): string {
  if (
    typeof value !== "string" ||
    value.trim().length < min ||
    value.length > max ||
    [...value].some((c) => c.charCodeAt(0) < 32 && c !== "\t")
  )
    return bad();
  return value.trim();
}
function version(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) return bad();
  return Number(value);
}
function conflict(
  code: string,
  message: string,
  currentVersion?: number,
): never {
  throw new ConflictException({
    code,
    message,
    correlation_id: randomUUID(),
    ...(currentVersion ? { current_version: currentVersion } : {}),
  });
}

@Injectable()
export class IncidentService implements OnModuleDestroy {
  private readonly database = connectDatabase(
    loadEnvironment(process.env).DATABASE_URL,
  );
  constructor(private readonly identity: IdentityService) {}
  async onModuleDestroy(): Promise<void> {
    await this.database.destroy();
  }

  private async withPermission<T>(
    token: string,
    organization: string,
    permission: string,
    run: (
      tx: DatabaseTransaction,
      membership: string,
      actor: string,
      role: string,
      scope: string,
    ) => Promise<T>,
  ): Promise<T> {
    const organizationId = id(organization);
    const actor = await this.identity.authenticateAccessToken(token);
    return tenantTransaction(
      this.database,
      organizationId,
      actor.userId,
      async (tx) => {
        const result = await sql<{
          membership_id: string;
          role_code: string;
          resource_scope: string;
          mfa_required: boolean;
        }>`
        select m.id membership_id,r.code role_code,rp.resource_scope,p.requires_privileged_mfa mfa_required
        from app.memberships m join app.organizations o on o.id=m.organization_id
        join app.membership_roles mr on mr.organization_id=m.organization_id and mr.membership_id=m.id
        join app.roles r on r.organization_id=mr.organization_id and r.id=mr.role_id
        join app.role_permissions rp on rp.organization_id=mr.organization_id and rp.role_id=mr.role_id
        join app.permissions p on p.id=rp.permission_id
        where m.organization_id=${organizationId} and m.user_id=${actor.userId}
          and m.status='ACTIVE' and o.status='ACTIVE' and p.code=${permission}
        order by
          case when p.code='transitionIncident' and r.code='INCIDENT_COMMANDER' then 0 else 1 end,
          case rp.resource_scope when 'TENANT' then 0 else 1 end
        limit 1
      `.execute(tx);
        const grant = result.rows[0];
        if (!grant) throw new ForbiddenException("Access denied");
        if (grant.mfa_required && actor.assurance !== "MFA")
          throw new ForbiddenException("Additional authentication required");
        if (mfaRoles.has(grant.role_code) && actor.assurance !== "MFA")
          throw new ForbiddenException("Additional authentication required");
        return run(
          tx,
          grant.membership_id,
          actor.userId,
          grant.role_code,
          grant.resource_scope,
        );
      },
    );
  }

  private async audit(
    tx: DatabaseTransaction,
    org: string,
    actor: string,
    membership: string,
    action: string,
    incident: string,
    metadata = "{}",
  ) {
    await sql`insert into app.audit_logs(organization_id,actor_user_id,actor_membership_id,action,resource_type,resource_id,result,correlation_id,metadata)
      values(${org},${actor},${membership},${action},'INCIDENT',${incident},'SUCCESS',${randomUUID()},${metadata}::jsonb)`.execute(
      tx,
    );
  }

  private async event(
    tx: DatabaseTransaction,
    org: string,
    incident: string,
    kind: "CREATED" | "UPDATED" | "TRANSITIONED",
    versionValue: number,
  ) {
    await sql`insert into app.change_events(organization_id,incident_id,entity_type,entity_id,event_kind,entity_version,visibility_scope)
      values(${org},${incident},'INCIDENT',${incident},${kind},${versionValue},'{}'::jsonb)`.execute(
      tx,
    );
  }

  async listIncidents(
    token: string,
    org: string,
    cursor?: string,
    limitValue?: string,
  ) {
    const limit = limitValue === undefined ? 50 : Number(limitValue);
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) return bad();
    let after: string | null = null;
    if (cursor !== undefined) {
      try {
        after = id(Buffer.from(cursor, "base64url").toString());
      } catch {
        return bad();
      }
    }
    return this.withPermission(
      token,
      org,
      "listIncidents",
      async (tx, _m, _a, _r, scope) => {
        // Assignment evidence is a Sprint 4 dependency; assigned-only grants fail closed until it exists.
        if (scope !== "TENANT") return { items: [], next_cursor: null };
        const rows = await sql<IncidentRecord>`
        select ${incidentColumns} from app.incidents
        where organization_id=${id(org)} and (${after}::uuid is null or id>${after}::uuid)
        order by id limit ${limit + 1}
      `.execute(tx);
        const items = rows.rows.slice(0, limit);
        return {
          items,
          next_cursor:
            rows.rows.length > limit
              ? Buffer.from(String(items.at(-1)!.id)).toString("base64url")
              : null,
        };
      },
    );
  }

  async getIncident(token: string, org: string, incidentValue: string) {
    const incident = id(incidentValue);
    return this.withPermission(
      token,
      org,
      "getIncident",
      async (tx, _m, _a, _r, scope) => {
        if (scope !== "TENANT")
          throw new NotFoundException("Incident unavailable");
        const row =
          await sql<IncidentRecord>`select ${incidentColumns} from app.incidents where organization_id=${id(org)} and id=${incident}`.execute(
            tx,
          );
        if (!row.rows[0]) throw new NotFoundException("Incident unavailable");
        return row.rows[0];
      },
    );
  }

  async createIncident(token: string, org: string, input: unknown) {
    const body = record(input);
    if (
      Object.keys(body).some(
        (k) => !["title", "category", "occurred_at", "source_kind"].includes(k),
      )
    )
      return bad();
    const title = bounded(body.title, 1, 200),
      category = body.category;
    if (typeof category !== "string" || !categories.has(category)) return bad();
    const occurredAt = body.occurred_at;
    if (
      typeof occurredAt !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T.*Z$/.test(occurredAt) ||
      Number.isNaN(Date.parse(occurredAt))
    )
      return bad();
    const sourceKind = bounded(body.source_kind, 1, 80),
      organizationId = id(org);
    return this.withPermission(
      token,
      organizationId,
      "createIncident",
      async (tx, membership, actor) => {
        const row =
          await sql<IncidentRecord>`insert into app.incidents(organization_id,title,category,occurred_at,source_kind)
        values(${organizationId},${title},${category},${occurredAt},${sourceKind}) returning ${incidentColumns}`.execute(
            tx,
          );
        const incident = String(row.rows[0]!.id);
        await this.event(tx, organizationId, incident, "CREATED", 1);
        await this.audit(
          tx,
          organizationId,
          actor,
          membership,
          "createIncident",
          incident,
        );
        return row.rows[0];
      },
    );
  }

  async updateIncident(
    token: string,
    org: string,
    incidentValue: string,
    input: unknown,
  ) {
    const body = record(input);
    if (Object.keys(body).some((k) => !["base_version", "title"].includes(k)))
      return bad();
    const base = version(body.base_version),
      title = bounded(body.title, 1, 200),
      organizationId = id(org),
      incident = id(incidentValue);
    return this.withPermission(
      token,
      organizationId,
      "updateIncident",
      async (tx, membership, actor) => {
        const row =
          await sql<IncidentRecord>`update app.incidents set title=${title},version=version+1,updated_at=now()
        where organization_id=${organizationId} and id=${incident} and version=${base}
        returning ${incidentColumns}`.execute(tx);
        if (!row.rows[0])
          await this.versionConflict(tx, organizationId, incident, base);
        const updated = row.rows[0]!;
        await this.event(
          tx,
          organizationId,
          incident,
          "UPDATED",
          Number(updated.version),
        );
        await this.audit(
          tx,
          organizationId,
          actor,
          membership,
          "updateIncident",
          incident,
        );
        return updated;
      },
    );
  }

  private async versionConflict(
    tx: DatabaseTransaction,
    org: string,
    incident: string,
    base: number,
  ): Promise<never> {
    const current = await sql<{
      version: number;
    }>`select version from app.incidents where organization_id=${org} and id=${incident}`.execute(
      tx,
    );
    if (!current.rows[0]) throw new NotFoundException("Incident unavailable");
    if (Number(current.rows[0].version) !== base)
      conflict(
        "STALE_VERSION",
        "Incident version is stale",
        Number(current.rows[0].version),
      );
    conflict("INVALID_TRANSITION", "Incident command is unavailable");
  }

  async transitionIncident(
    token: string,
    org: string,
    incidentValue: string,
    input: unknown,
  ) {
    const body = record(input);
    if (
      Object.keys(body).some(
        (k) => !["base_version", "target", "reason", "outcome"].includes(k),
      )
    )
      return bad();
    const base = version(body.base_version),
      target = body.target,
      reason = bounded(body.reason, 1, 1000);
    if (typeof target !== "string" || !states.has(target)) return bad();
    if (body.outcome !== undefined) bounded(body.outcome, 1, 2000);
    const organizationId = id(org),
      incident = id(incidentValue);
    return this.withPermission(
      token,
      organizationId,
      "transitionIncident",
      async (tx, membership, actor, role) => {
        const current = await sql<{
          status: string;
          version: number;
        }>`select status,version from app.incidents where organization_id=${organizationId} and id=${incident}`.execute(
          tx,
        );
        if (!current.rows[0])
          throw new NotFoundException("Incident unavailable");
        if (Number(current.rows[0].version) !== base)
          conflict(
            "STALE_VERSION",
            "Incident version is stale",
            Number(current.rows[0].version),
          );
        const from = current.rows[0].status;
        if (target === "CANCELLED" && !(from === "DRAFT" || from === "OPEN"))
          conflict("INVALID_TRANSITION", "Incident transition is invalid");
        if (target === "CANCELLED" && role !== "INCIDENT_COMMANDER")
          throw new ForbiddenException("Access denied");
        if (target === "OPEN" && from !== "DRAFT")
          conflict("INVALID_TRANSITION", "Incident transition is invalid");
        if (
          (from === "OPEN" && target === "DISPATCHED") ||
          (from === "DISPATCHED" && target === "ON_SCENE") ||
          (from === "ON_SCENE" &&
            ["MONITORING", "RETURNING"].includes(target)) ||
          (from === "MONITORING" && target === "RETURNING")
        )
          conflict(
            "PREREQUISITE_UNAVAILABLE",
            "Required assignment or movement evidence is unavailable",
          );
        if (target !== "OPEN" && target !== "CANCELLED")
          conflict("INVALID_TRANSITION", "Incident transition is invalid");
        const updated =
          await sql<IncidentRecord>`update app.incidents set status=${target},version=version+1,updated_at=now()
        where organization_id=${organizationId} and id=${incident} and version=${base} and status=${from}
        returning ${incidentColumns}`.execute(tx);
        if (!updated.rows[0])
          await this.versionConflict(tx, organizationId, incident, base);
        const result = updated.rows[0]!;
        await this.event(
          tx,
          organizationId,
          incident,
          "TRANSITIONED",
          Number(result.version),
        );
        const metadata =
          target === "CANCELLED"
            ? JSON.stringify(
                protectCancellationReason(reason, {
                  organizationId,
                  incidentId: incident,
                  actorUserId: actor,
                }),
              )
            : "{}";
        await this.audit(
          tx,
          organizationId,
          actor,
          membership,
          "transitionIncident",
          incident,
          metadata,
        );
        return result;
      },
    );
  }
}
