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

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const movementKinds = new Set(["DEPARTURE", "ARRIVAL", "RETURN", "OTHER"]);
const privilegedRoles = new Set([
  "ORGANIZATION_ADMIN",
  "CONTROL_ROOM_OPERATOR",
  "INCIDENT_COMMANDER",
  "READ_ONLY_AUDITOR",
]);
const readRoles = new Set([...privilegedRoles, "FIELD_RESPONDER"]);
const writeRoles = new Set([
  "CONTROL_ROOM_OPERATOR",
  "INCIDENT_COMMANDER",
  "FIELD_RESPONDER",
]);

interface AccessGrant {
  membership_id: string;
  role_code: string;
  resource_scope: "TENANT" | "ASSIGNED";
  requires_privileged_mfa: boolean;
}

interface MovementRecord {
  id: string;
  version: number;
  created_at: Date;
  organization_id: string;
  incident_id: string;
  incident_vehicle_id: string;
  location_id: string | null;
  kind: string;
  occurred_at: Date;
  received_at: Date;
  actor_membership_id: string;
  supersedes_id: string | null;
  note: string | null;
}

interface CursorValue {
  occurred_at: string;
  received_at: string;
  id: string;
}

function bad(): never {
  throw new BadRequestException("Invalid request");
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return bad();
  return value as Record<string, unknown>;
}

function uuid(value: unknown): string {
  if (typeof value !== "string" || !uuidPattern.test(value)) return bad();
  return value;
}

function isPgCode(error: unknown, code: string): boolean {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: unknown }).code === code,
  );
}

function parseCursor(value?: string): CursorValue | null {
  if (value === undefined) return null;
  if (
    value.length < 1 ||
    value.length > 2048 ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  )
    return bad();
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(value, "base64url").toString(),
    );
    const cursor = object(parsed);
    if (
      Object.keys(cursor).length !== 3 ||
      typeof cursor.occurred_at !== "string" ||
      typeof cursor.received_at !== "string" ||
      !Number.isFinite(Date.parse(cursor.occurred_at)) ||
      !Number.isFinite(Date.parse(cursor.received_at))
    )
      return bad();
    return {
      occurred_at: new Date(cursor.occurred_at).toISOString(),
      received_at: new Date(cursor.received_at).toISOString(),
      id: uuid(cursor.id),
    };
  } catch {
    return bad();
  }
}

function encodeCursor(row: MovementRecord): string {
  return Buffer.from(
    JSON.stringify({
      occurred_at: row.occurred_at.toISOString(),
      received_at: row.received_at.toISOString(),
      id: row.id,
    }),
  ).toString("base64url");
}

function output(row: MovementRecord) {
  return {
    id: row.id,
    version: Number(row.version),
    created_at: row.created_at,
    organization_id: row.organization_id,
    incident_id: row.incident_id,
    incident_vehicle_id: row.incident_vehicle_id,
    ...(row.location_id === null ? {} : { location_id: row.location_id }),
    kind: row.kind,
    occurred_at: row.occurred_at,
    received_at: row.received_at,
    actor_membership_id: row.actor_membership_id,
    ...(row.supersedes_id === null ? {} : { supersedes_id: row.supersedes_id }),
  };
}

@Injectable()
export class MovementService implements OnModuleDestroy {
  private readonly database = connectDatabase(
    loadEnvironment(process.env).DATABASE_URL,
  );

  constructor(private readonly identity: IdentityService) {}

  async onModuleDestroy(): Promise<void> {
    await this.database.destroy();
  }

  private async withPermission<T>(
    token: string,
    organizationValue: string,
    permission: "listMovements" | "createMovement",
    run: (
      tx: DatabaseTransaction,
      membershipId: string,
      actorUserId: string,
      role: string,
      scope: "TENANT" | "ASSIGNED",
    ) => Promise<T>,
  ): Promise<T> {
    const organizationId = uuid(organizationValue);
    const actor = await this.identity.authenticateAccessToken(token);
    return tenantTransaction(
      this.database,
      organizationId,
      actor.userId,
      async (tx) => {
        const result = await sql<AccessGrant>`
          select m.id as membership_id,r.code as role_code,
            rp.resource_scope,p.requires_privileged_mfa
          from app.memberships m
          join app.organizations o on o.id=m.organization_id
          join app.membership_roles mr
            on mr.organization_id=m.organization_id and mr.membership_id=m.id
          join app.roles r
            on r.organization_id=mr.organization_id and r.id=mr.role_id
          join app.role_permissions rp
            on rp.organization_id=mr.organization_id and rp.role_id=mr.role_id
          join app.permissions p on p.id=rp.permission_id
          where m.organization_id=${organizationId} and m.user_id=${actor.userId}
            and m.status='ACTIVE' and o.status='ACTIVE' and p.code=${permission}
          order by case rp.resource_scope when 'TENANT' then 0 else 1 end
          limit 10
        `.execute(tx);
        const grant = result.rows.find((candidate) =>
          permission === "listMovements"
            ? readRoles.has(candidate.role_code)
            : writeRoles.has(candidate.role_code),
        );
        if (!grant) throw new ForbiddenException("Access denied");
        if (
          (grant.requires_privileged_mfa ||
            privilegedRoles.has(grant.role_code)) &&
          actor.assurance !== "MFA"
        )
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

  private async requireIncident(
    tx: DatabaseTransaction,
    organizationId: string,
    incidentId: string,
    membershipId: string,
    scope: "TENANT" | "ASSIGNED",
  ): Promise<void> {
    const incident = await sql<{ id: string }>`
      select id from app.incidents
      where organization_id=${organizationId} and id=${incidentId}
    `.execute(tx);
    if (!incident.rows[0]) throw new NotFoundException("Incident unavailable");
    if (scope === "ASSIGNED") {
      const assignment = await sql<{ id: string }>`
        select id from app.incident_personnel
        where organization_id=${organizationId} and incident_id=${incidentId}
          and membership_id=${membershipId} and released_at is null
        limit 1
      `.execute(tx);
      if (!assignment.rows[0])
        throw new NotFoundException("Incident unavailable");
    }
  }

  async listMovements(
    token: string,
    organizationValue: string,
    incidentValue: string,
    cursorValue?: string,
    limitValue?: string,
  ) {
    const organizationId = uuid(organizationValue);
    const incidentId = uuid(incidentValue);
    const limit = limitValue === undefined ? 50 : Number(limitValue);
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) return bad();
    const cursor = parseCursor(cursorValue);
    return this.withPermission(
      token,
      organizationId,
      "listMovements",
      async (tx, membershipId, _actor, _role, scope) => {
        await this.requireIncident(
          tx,
          organizationId,
          incidentId,
          membershipId,
          scope,
        );
        const result = await sql<MovementRecord>`
          select id,version,created_at,organization_id,incident_id,
            incident_vehicle_id,location_id,kind,occurred_at,received_at,
            actor_membership_id,supersedes_id
          from app.movement_logs
          where organization_id=${organizationId} and incident_id=${incidentId}
            and (
              ${cursor === null}::boolean or
              (occurred_at,received_at,id) >
                (${cursor?.occurred_at ?? null}::timestamptz,
                 ${cursor?.received_at ?? null}::timestamptz,
                 ${cursor?.id ?? null}::uuid)
            )
          order by occurred_at,received_at,id
          limit ${limit + 1}
        `.execute(tx);
        const rows = result.rows.slice(0, limit);
        return {
          items: rows.map(output),
          next_cursor:
            result.rows.length > limit ? encodeCursor(rows.at(-1)!) : null,
        };
      },
    );
  }

  async createMovement(
    token: string,
    organizationValue: string,
    incidentValue: string,
    input: unknown,
  ) {
    const body = object(input);
    const allowed = new Set([
      "id",
      "incident_vehicle_id",
      "location_id",
      "kind",
      "occurred_at",
      "note",
      "supersedes_id",
    ]);
    if (Object.keys(body).some((key) => !allowed.has(key))) return bad();
    const movementId = body.id === undefined ? randomUUID() : uuid(body.id);
    const incidentVehicleId = uuid(body.incident_vehicle_id);
    const locationId =
      body.location_id === undefined ? null : uuid(body.location_id);
    if (typeof body.kind !== "string" || !movementKinds.has(body.kind))
      return bad();
    if (
      typeof body.occurred_at !== "string" ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(body.occurred_at) ||
      !Number.isFinite(Date.parse(body.occurred_at))
    )
      return bad();
    const occurredAt = new Date(body.occurred_at).toISOString();
    const note =
      body.note === undefined
        ? null
        : typeof body.note === "string" &&
            body.note.length >= 1 &&
            body.note.length <= 1000 &&
            body.note.trim().length > 0
          ? body.note
          : bad();
    const supersedesId =
      body.supersedes_id === undefined ? null : uuid(body.supersedes_id);
    const organizationId = uuid(organizationValue);
    const incidentId = uuid(incidentValue);

    try {
      return await this.withPermission(
        token,
        organizationId,
        "createMovement",
        async (tx, membershipId, actorUserId, _role, scope) => {
          await this.requireIncident(
            tx,
            organizationId,
            incidentId,
            membershipId,
            scope,
          );
          const existing = await sql<MovementRecord>`
            select id,version,created_at,organization_id,incident_id,
              incident_vehicle_id,location_id,kind,occurred_at,received_at,
              actor_membership_id,supersedes_id,note
            from app.movement_logs
            where organization_id=${organizationId} and id=${movementId}
          `.execute(tx);
          if (existing.rows[0]) {
            const row = existing.rows[0];
            if (
              row.incident_id === incidentId &&
              row.incident_vehicle_id === incidentVehicleId &&
              row.location_id === locationId &&
              row.kind === body.kind &&
              row.occurred_at.toISOString() === occurredAt &&
              row.supersedes_id === supersedesId &&
              row.note === note &&
              row.actor_membership_id === membershipId
            )
              return output(row);
            throw new ConflictException("Movement cannot be completed");
          }

          const assignment = await sql<{ id: string }>`
            select id from app.incident_vehicles
            where organization_id=${organizationId} and incident_id=${incidentId}
              and id=${incidentVehicleId}
            limit 1
          `.execute(tx);
          if (!assignment.rows[0])
            throw new NotFoundException("Incident unavailable");
          if (locationId !== null) {
            const location = await sql<{ id: string }>`
              select id from app.incident_locations
              where organization_id=${organizationId} and incident_id=${incidentId}
                and id=${locationId}
              limit 1
            `.execute(tx);
            if (!location.rows[0])
              throw new NotFoundException("Incident unavailable");
          }
          if (supersedesId !== null) {
            const predecessor = await sql<{ id: string }>`
              select id from app.movement_logs
              where organization_id=${organizationId} and incident_id=${incidentId}
                and id=${supersedesId}
              limit 1
            `.execute(tx);
            if (!predecessor.rows[0])
              throw new NotFoundException("Incident unavailable");
          }
          const inserted = await sql<MovementRecord>`
            insert into app.movement_logs
              (id,organization_id,incident_id,incident_vehicle_id,location_id,
               kind,occurred_at,actor_membership_id,supersedes_id,note)
            values
              (${movementId},${organizationId},${incidentId},${incidentVehicleId},
               ${locationId},${body.kind},${occurredAt},${membershipId},
               ${supersedesId},${note})
            returning id,version,created_at,organization_id,incident_id,
              incident_vehicle_id,location_id,kind,occurred_at,received_at,
              actor_membership_id,supersedes_id,note
          `.execute(tx);
          const movement = inserted.rows[0]!;
          await sql`
            insert into app.audit_logs
              (organization_id,actor_user_id,actor_membership_id,action,
               resource_type,resource_id,result,correlation_id,metadata)
            values(${organizationId},${actorUserId},${membershipId},'createMovement',
              'MOVEMENT',${movementId},'SUCCESS',${randomUUID()},'{}'::jsonb)
          `.execute(tx);
          return output(movement);
        },
      );
    } catch (error) {
      if (isPgCode(error, "23505") || isPgCode(error, "23503"))
        throw new ConflictException("Movement cannot be completed");
      throw error;
    }
  }
}
