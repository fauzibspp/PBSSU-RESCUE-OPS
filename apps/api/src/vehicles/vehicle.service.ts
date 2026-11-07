import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
} from "@nestjs/common";
import { sql } from "kysely";
import { loadEnvironment } from "../config.js";
import {
  connectDatabase,
  tenantTransaction,
  type DatabaseTransaction,
} from "../database/connection.js";
import { IdentityService } from "../identity/identity.service.js";

const identifier =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const serviceStates = new Set(["AVAILABLE", "MAINTENANCE", "RETIRED"]);

function uuid(value: unknown): string {
  if (typeof value !== "string" || !identifier.test(value))
    throw new BadRequestException("Invalid request");
  return value;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new BadRequestException("Invalid request");
  return value as Record<string, unknown>;
}

function label(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.trim().length < 1 ||
    value.trim().length > 64 ||
    [...value].some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127;
    })
  )
    throw new BadRequestException("Invalid request");
  return value.trim();
}

export interface VehicleRow {
  id: string;
  version: number;
  created_at: Date;
  organization_id: string;
  call_sign: string;
  kind: string;
  service_state: "AVAILABLE" | "MAINTENANCE" | "RETIRED";
}

@Injectable()
export class VehicleService implements OnModuleDestroy {
  private readonly database = connectDatabase(
    loadEnvironment(process.env).DATABASE_URL,
  );

  constructor(private readonly identity: IdentityService) {}

  async onModuleDestroy(): Promise<void> {
    await this.database.destroy();
  }

  private async withTenant<T>(
    token: string,
    organizationValue: string,
    permission: string,
    run: (
      transaction: DatabaseTransaction,
      membershipId: string,
      userId: string,
    ) => Promise<T>,
  ): Promise<T> {
    const organizationId = uuid(organizationValue);
    const actor = await this.identity.authenticateAccessToken(token);
    return tenantTransaction(
      this.database,
      organizationId,
      actor.userId,
      async (transaction) => {
        const access = await sql<{
          membership_id: string;
          requires_privileged_mfa: boolean;
        }>`
          select m.id as membership_id,p.requires_privileged_mfa
          from app.memberships m
          join app.organizations o on o.id=m.organization_id
          join app.membership_roles mr
            on mr.organization_id=m.organization_id and mr.membership_id=m.id
          join app.role_permissions rp
            on rp.organization_id=mr.organization_id and rp.role_id=mr.role_id
          join app.permissions p on p.id=rp.permission_id
          where m.organization_id=${organizationId} and m.user_id=${actor.userId}
            and m.status='ACTIVE' and o.status='ACTIVE' and p.code=${permission}
          limit 1
        `.execute(transaction);
        const grant = access.rows[0];
        if (!grant) throw new ForbiddenException("Access denied");
        if (grant.requires_privileged_mfa && actor.assurance !== "MFA")
          throw new ForbiddenException("Additional authentication required");
        return run(transaction, grant.membership_id, actor.userId);
      },
    );
  }

  private async audit(
    transaction: DatabaseTransaction,
    organizationId: string,
    userId: string,
    membershipId: string,
    action: string,
    vehicleId: string,
  ): Promise<void> {
    await sql`
      insert into app.audit_logs
        (organization_id,actor_user_id,actor_membership_id,action,resource_type,resource_id,result,correlation_id,metadata)
      values
        (${organizationId},${userId},${membershipId},${action},'VEHICLE',${vehicleId},'SUCCESS',gen_random_uuid(),'{}'::jsonb)
    `.execute(transaction);
  }

  async listVehicles(
    token: string,
    organizationValue: string,
    cursor?: string,
    limitValue?: string,
  ) {
    const organizationId = uuid(organizationValue);
    const limit = limitValue === undefined ? 50 : Number(limitValue);
    if (!Number.isInteger(limit) || limit < 1 || limit > 200)
      throw new BadRequestException("Invalid request");
    const after = cursor
      ? uuid(Buffer.from(cursor, "base64url").toString())
      : null;
    return this.withTenant(
      token,
      organizationId,
      "listVehicles",
      async (tx) => {
        const result = await sql<VehicleRow>`
        select id,version,created_at,organization_id,call_sign,kind,service_state
        from app.vehicles
        where organization_id=${organizationId}
          and (${after}::uuid is null or id>${after}::uuid)
        order by id limit ${limit + 1}
      `.execute(tx);
        const rows = result.rows.slice(0, limit);
        return {
          items: rows,
          next_cursor:
            result.rows.length > limit
              ? Buffer.from(rows.at(-1)!.id).toString("base64url")
              : null,
        };
      },
    );
  }

  async createVehicle(
    token: string,
    organizationValue: string,
    input: unknown,
  ): Promise<VehicleRow> {
    const body = object(input);
    if (Object.keys(body).some((key) => !["call_sign", "kind"].includes(key)))
      throw new BadRequestException("Invalid request");
    const callSign = label(body.call_sign);
    const kind = label(body.kind);
    const organizationId = uuid(organizationValue);
    try {
      return await this.withTenant(
        token,
        organizationId,
        "createVehicle",
        async (transaction, membershipId, userId) => {
          const inserted = await sql<VehicleRow>`
            insert into app.vehicles (organization_id,call_sign,kind)
            values (${organizationId},${callSign},${kind})
            returning id,version,created_at,organization_id,call_sign,kind,service_state
          `.execute(transaction);
          const vehicle = inserted.rows[0]!;
          await this.audit(
            transaction,
            organizationId,
            userId,
            membershipId,
            "createVehicle",
            vehicle.id,
          );
          return vehicle;
        },
      );
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "23505"
      )
        throw new ConflictException("Vehicle call sign already exists");
      throw error;
    }
  }

  async updateVehicle(
    token: string,
    organizationValue: string,
    vehicleValue: string,
    input: unknown,
  ): Promise<VehicleRow> {
    const body = object(input);
    if (
      Object.keys(body).some(
        (key) => !["base_version", "service_state"].includes(key),
      ) ||
      !Number.isInteger(body.base_version) ||
      Number(body.base_version) < 1 ||
      typeof body.service_state !== "string" ||
      !serviceStates.has(body.service_state)
    )
      throw new BadRequestException("Invalid request");
    const organizationId = uuid(organizationValue);
    const vehicleId = uuid(vehicleValue);
    return this.withTenant(
      token,
      organizationId,
      "updateVehicle",
      async (transaction, membershipId, userId) => {
        const updated = await sql<VehicleRow>`
          update app.vehicles
          set service_state=${body.service_state},version=version+1,updated_at=now()
          where id=${vehicleId} and organization_id=${organizationId}
            and version=${Number(body.base_version)}
          returning id,version,created_at,organization_id,call_sign,kind,service_state
        `.execute(transaction);
        const vehicle = updated.rows[0];
        if (!vehicle) {
          const existing = await sql<{ version: number }>`
            select version from app.vehicles
            where id=${vehicleId} and organization_id=${organizationId}
          `.execute(transaction);
          if (!existing.rows[0])
            throw new NotFoundException("Vehicle unavailable");
          throw new ConflictException("Vehicle update version is stale");
        }
        await this.audit(
          transaction,
          organizationId,
          userId,
          membershipId,
          "updateVehicle",
          vehicle.id,
        );
        return vehicle;
      },
    );
  }
}
