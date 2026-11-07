import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  PipeTransform,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { IdentityService } from "../identity/identity.service.js";
import { OrganizationService } from "./organization.service.js";

function bearer(value: string | undefined): string {
  const token = value?.match(/^Bearer ([A-Za-z0-9._~-]+)$/)?.[1];
  if (!token) throw new BadRequestException("Authentication required");
  return token;
}

class JsonObjectPipe implements PipeTransform<
  unknown,
  Record<string, unknown>
> {
  transform(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new BadRequestException("Invalid request");
    return value as Record<string, unknown>;
  }
}

@Controller()
export class OrganizationController {
  constructor(
    private readonly identity: IdentityService,
    private readonly organizations: OrganizationService,
  ) {}

  @Post("/platform/organizations")
  onboardOrganization(
    @Headers("authorization") authorization: string | undefined,
    @Body(new JsonObjectPipe()) body: Record<string, unknown>,
  ) {
    return this.identity.onboardOrganization(bearer(authorization), body);
  }

  @Post("/organization-invitations")
  inviteMember(
    @Headers("authorization") auth: string | undefined,
    @Headers("x-organization-id") org: string,
    @Body(new JsonObjectPipe()) body: Record<string, unknown>,
  ) {
    return this.identity.inviteMember(bearer(auth), org, body);
  }

  @Post("/organization-invitations/:invitationId/revoke")
  revokeInvitation(
    @Headers("authorization") auth: string | undefined,
    @Headers("x-organization-id") org: string,
    @Param("invitationId") id: string,
    @Body(new JsonObjectPipe()) body: Record<string, unknown>,
  ) {
    return this.identity.revokeInvitation(bearer(auth), org, id, body);
  }

  @Get("/platform/organizations")
  listOrganizations(
    @Headers("authorization") authorization: string | undefined,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
  ) {
    return this.identity.listOrganizations(
      bearer(authorization),
      cursor,
      limit,
    );
  }

  @Get("/organization")
  getOrganization(
    @Headers("authorization") auth: string | undefined,
    @Headers("x-organization-id") org: string,
  ) {
    return this.organizations.getOrganization(bearer(auth), org);
  }

  @Patch("/organization")
  updateOrganization(
    @Headers("authorization") auth: string | undefined,
    @Headers("x-organization-id") org: string,
    @Body() body: unknown,
  ) {
    return this.organizations.updateOrganization(bearer(auth), org, body);
  }

  @Get("/memberships")
  listPersonnel(
    @Headers("authorization") auth: string | undefined,
    @Headers("x-organization-id") org: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
  ) {
    return this.organizations.listPersonnel(bearer(auth), org, cursor, limit);
  }

  @Patch("/memberships/:membershipId")
  updatePersonnel(
    @Headers("authorization") auth: string | undefined,
    @Headers("x-organization-id") org: string,
    @Param("membershipId") id: string,
    @Body() body: unknown,
  ) {
    return this.organizations.updatePersonnel(bearer(auth), org, id, body);
  }

  @Put("/memberships/:membershipId/roles")
  setMembershipRoles(
    @Headers("authorization") auth: string | undefined,
    @Headers("x-organization-id") org: string,
    @Param("membershipId") id: string,
    @Body() body: unknown,
  ) {
    return this.organizations.setMembershipRoles(bearer(auth), org, id, body);
  }

  @Get("/roles")
  listRoles(
    @Headers("authorization") auth: string | undefined,
    @Headers("x-organization-id") org: string,
  ) {
    return this.organizations.listRoles(bearer(auth), org);
  }

  @Post("/roles")
  createRole(
    @Headers("authorization") auth: string | undefined,
    @Headers("x-organization-id") org: string,
    @Body() body: unknown,
  ) {
    return this.organizations.createRole(bearer(auth), org, body);
  }

  @Get("/permissions")
  listPermissions(
    @Headers("authorization") auth: string | undefined,
    @Headers("x-organization-id") org: string,
  ) {
    return this.organizations.listPermissions(bearer(auth), org);
  }

  @Get("/settings")
  getSettings(
    @Headers("authorization") auth: string | undefined,
    @Headers("x-organization-id") org: string,
  ) {
    return this.organizations.getSettings(bearer(auth), org);
  }

  @Put("/settings")
  updateSettings(
    @Headers("authorization") auth: string | undefined,
    @Headers("x-organization-id") org: string,
    @Body() body: unknown,
  ) {
    return this.organizations.updateSettings(bearer(auth), org, body);
  }
}
