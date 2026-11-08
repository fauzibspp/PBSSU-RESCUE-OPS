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
const privilegedRoles = new Set([
  "ORGANIZATION_ADMIN",
  "CONTROL_ROOM_OPERATOR",
  "INCIDENT_COMMANDER",
  "READ_ONLY_AUDITOR",
]);
const readRoles = new Set([
  "ORGANIZATION_ADMIN",
  "CONTROL_ROOM_OPERATOR",
  "INCIDENT_COMMANDER",
  "READ_ONLY_AUDITOR",
  "FIELD_RESPONDER",
]);
const writeRoles = new Set(["CONTROL_ROOM_OPERATOR", "INCIDENT_COMMANDER"]);

interface AccessGrant {
  membership_id: string;
  role_code: string;
  resource_scope: "TENANT" | "ASSIGNED";
  requires_privileged_mfa: boolean;
}

interface IncidentRow {
  id: string;
  version: number;
  status: string;
}

interface PersonnelRow {
  id: string;
  membership_id: string;
  duty: string | null;
  assigned_at: Date;
  released_at: Date | null;
}

interface VehicleRow {
  id: string;
  vehicle_id: string;
  assigned_at: Date;
  released_at: Date | null;
}

function bad(): never {
  throw new BadRequestException("Invalid request");
}

function uuid(value: unknown): string {
  if (typeof value !== "string" || !uuidPattern.test(value)) return bad();
  return value;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return bad();
  return value as Record<string, unknown>;
}

function uuidArray(value: unknown, maximum: number): string[] {
  if (!Array.isArray(value) || value.length > maximum) return bad();
  const values = value.map(uuid);
  if (new Set(values).size !== values.length) return bad();
  return values;
}

function isPgCode(error: unknown, code: string): boolean {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: unknown }).code === code,
  );
}

@Injectable()
export class AssignmentService implements OnModuleDestroy {
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
    permission: "getAssignments" | "setAssignments",
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
          permission === "getAssignments"
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

  private async response(
    tx: DatabaseTransaction,
    organizationId: string,
    incidentId: string,
    version: number,
  ) {
    const personnel = await sql<PersonnelRow>`
      select id,membership_id,duty,assigned_at,released_at
      from app.incident_personnel
      where organization_id=${organizationId} and incident_id=${incidentId}
      order by assigned_at,id
    `.execute(tx);
    const vehicles = await sql<VehicleRow>`
      select id,vehicle_id,assigned_at,released_at
      from app.incident_vehicles
      where organization_id=${organizationId} and incident_id=${incidentId}
      order by assigned_at,id
    `.execute(tx);
    return {
      incident_id: incidentId,
      version,
      personnel: personnel.rows.map((row) => ({
        id: row.id,
        membership_id: row.membership_id,
        ...(row.duty === null ? { duty: null } : { duty: row.duty }),
        assigned_at: row.assigned_at,
        ...(row.released_at === null ? {} : { released_at: row.released_at }),
      })),
      vehicles: vehicles.rows.map((row) => ({
        id: row.id,
        vehicle_id: row.vehicle_id,
        assigned_at: row.assigned_at,
        ...(row.released_at === null ? {} : { released_at: row.released_at }),
      })),
    };
  }

  async getAssignments(
    token: string,
    organizationValue: string,
    incidentValue: string,
  ) {
    const organizationId = uuid(organizationValue);
    const incidentId = uuid(incidentValue);
    return this.withPermission(
      token,
      organizationId,
      "getAssignments",
      async (tx, membershipId, _actor, _role, scope) => {
        const incident = await sql<IncidentRow>`
          select id,version,status from app.incidents
          where organization_id=${organizationId} and id=${incidentId}
        `.execute(tx);
        const row = incident.rows[0];
        if (!row) throw new NotFoundException("Incident unavailable");
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
        return this.response(
          tx,
          organizationId,
          incidentId,
          Number(row.version),
        );
      },
    );
  }

  async setAssignments(
    token: string,
    organizationValue: string,
    incidentValue: string,
    input: unknown,
  ) {
    const body = object(input);
    if (
      Object.keys(body).some(
        (key) =>
          !["base_version", "membership_ids", "vehicle_ids"].includes(key),
      ) ||
      !Number.isSafeInteger(body.base_version) ||
      Number(body.base_version) < 1
    )
      return bad();
    const baseVersion = Number(body.base_version);
    const membershipIds = uuidArray(body.membership_ids, 50);
    const vehicleIds = uuidArray(body.vehicle_ids, 20);
    const organizationId = uuid(organizationValue);
    const incidentId = uuid(incidentValue);

    try {
      return await this.withPermission(
        token,
        organizationId,
        "setAssignments",
        async (tx, membershipId, actorUserId, _role) => {
          const incidentResult = await sql<IncidentRow>`
            select id,version,status from app.incidents
            where organization_id=${organizationId} and id=${incidentId}
            for update
          `.execute(tx);
          const incident = incidentResult.rows[0];
          if (!incident) throw new NotFoundException("Incident unavailable");
          if (Number(incident.version) !== baseVersion)
            throw new ConflictException({
              code: "STALE_VERSION",
              message: "Incident version is stale",
              correlation_id: randomUUID(),
              current_version: Number(incident.version),
            });
          if (incident.status !== "DRAFT" && incident.status !== "OPEN")
            throw new ConflictException({
              code: "INVALID_TRANSITION",
              message: "Assignments cannot change in this incident state",
            });

          const eligibleMembers = await sql<{
            id: string;
            user_id: string;
            status: string;
          }>`
            select id,user_id,status from app.memberships
            where organization_id=${organizationId} and id=any(${membershipIds})
              and exists (
                select 1 from app.membership_roles mr
                join app.roles r on r.organization_id=mr.organization_id
                  and r.id=mr.role_id
                where mr.organization_id=app.memberships.organization_id
                  and mr.membership_id=app.memberships.id
                  and r.code='FIELD_RESPONDER'
              )
            order by user_id,id
            for update
          `.execute(tx);
          if (
            eligibleMembers.rows.length !== membershipIds.length ||
            eligibleMembers.rows.some((member) => member.status !== "ACTIVE")
          )
            throw new ConflictException("Assignment cannot be completed");

          const eligibleVehicles = await sql<{
            id: string;
            service_state: string;
          }>`
            select id,service_state from app.vehicles
            where organization_id=${organizationId} and id=any(${vehicleIds})
            order by id
            for update
          `.execute(tx);
          if (
            eligibleVehicles.rows.length !== vehicleIds.length ||
            eligibleVehicles.rows.some(
              (vehicle) => vehicle.service_state !== "AVAILABLE",
            )
          )
            throw new ConflictException("Assignment cannot be completed");

          const existingPersonnel = await sql<{
            id: string;
            membership_id: string;
          }>`
            select id,membership_id from app.incident_personnel
            where organization_id=${organizationId} and incident_id=${incidentId}
              and released_at is null
            order by membership_id,id
            for update
          `.execute(tx);
          const existingVehicles = await sql<{
            id: string;
            vehicle_id: string;
          }>`
            select id,vehicle_id from app.incident_vehicles
            where organization_id=${organizationId} and incident_id=${incidentId}
              and released_at is null
            order by vehicle_id,id
            for update
          `.execute(tx);
          const currentMembers = existingPersonnel.rows
            .map((row) => row.membership_id)
            .sort();
          const currentVehicles = existingVehicles.rows
            .map((row) => row.vehicle_id)
            .sort();
          const requestedMembers = [...membershipIds].sort();
          const requestedVehicles = [...vehicleIds].sort();
          if (
            JSON.stringify(currentMembers) ===
              JSON.stringify(requestedMembers) &&
            JSON.stringify(currentVehicles) ===
              JSON.stringify(requestedVehicles)
          )
            return this.response(
              tx,
              organizationId,
              incidentId,
              Number(incident.version),
            );

          await sql`
            update app.incident_personnel set released_at=now()
            where organization_id=${organizationId} and incident_id=${incidentId}
              and released_at is null and not (membership_id=any(${membershipIds}))
          `.execute(tx);
          await sql`
            update app.incident_vehicles set released_at=now()
            where organization_id=${organizationId} and incident_id=${incidentId}
              and released_at is null and not (vehicle_id=any(${vehicleIds}))
          `.execute(tx);

          const activeMemberIds = new Set(currentMembers);
          for (const selectedMembershipId of membershipIds) {
            if (activeMemberIds.has(selectedMembershipId)) continue;
            const member = eligibleMembers.rows.find(
              (candidate) => candidate.id === selectedMembershipId,
            )!;
            await sql`
              insert into app.incident_personnel
                (organization_id,incident_id,membership_id,user_id)
              values(${organizationId},${incidentId},${member.id},${member.user_id})
            `.execute(tx);
          }
          const activeVehicleIds = new Set(currentVehicles);
          for (const selectedVehicleId of vehicleIds) {
            if (activeVehicleIds.has(selectedVehicleId)) continue;
            await sql`
              insert into app.incident_vehicles
                (organization_id,incident_id,vehicle_id)
              values(${organizationId},${incidentId},${selectedVehicleId})
            `.execute(tx);
          }

          const updated = await sql<{ version: number }>`
            update app.incidents
            set version=version+1,updated_at=now()
            where organization_id=${organizationId} and id=${incidentId}
              and version=${baseVersion} and status in ('DRAFT','OPEN')
            returning version
          `.execute(tx);
          if (!updated.rows[0])
            throw new ConflictException({
              code: "STALE_VERSION",
              message: "Incident version is stale",
              correlation_id: randomUUID(),
            });
          await sql`
            insert into app.audit_logs
              (organization_id,actor_user_id,actor_membership_id,action,
               resource_type,resource_id,result,correlation_id,metadata)
            values(${organizationId},${actorUserId},${membershipId},'setAssignments',
              'INCIDENT',${incidentId},'SUCCESS',${randomUUID()},'{}'::jsonb)
          `.execute(tx);
          return this.response(
            tx,
            organizationId,
            incidentId,
            Number(updated.rows[0].version),
          );
        },
      );
    } catch (error) {
      if (isPgCode(error, "23505"))
        throw new ConflictException("Assignment cannot be completed");
      if (isPgCode(error, "23503"))
        throw new ConflictException("Assignment cannot be completed");
      throw error;
    }
  }
}
