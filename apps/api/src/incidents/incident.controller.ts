import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UnauthorizedException,
  UseFilters,
} from "@nestjs/common";
import { parseCookie } from "cookie";
import { IdentityService } from "../identity/identity.service.js";
import { loadEnvironment } from "../config.js";
import { IncidentService } from "./incident.service.js";
import { IncidentErrorFilter } from "./incident-error.filter.js";
import { isTrustedCookieReadRequest } from "../security/browser-request.js";

function bearer(value: string | undefined): string {
  const token = value?.match(/^Bearer ([A-Za-z0-9._~-]+)$/)?.[1];
  if (!token) throw new UnauthorizedException("Authentication required");
  return token;
}

@Controller()
@UseFilters(IncidentErrorFilter)
export class IncidentController {
  constructor(
    private readonly incidents: IncidentService,
    private readonly identity: IdentityService,
  ) {}

  private async readToken(
    authorization: string | undefined,
    cookieHeader: string | undefined,
    csrf: string | undefined,
    origin: string | undefined,
    referer: string | undefined,
    fetchSite: string | undefined,
  ): Promise<string> {
    const cookies = parseCookie(cookieHeader ?? "");
    const access = cookies["__Host-pbssu_access"];
    if (!access) return bearer(authorization);
    const binding = cookies["__Host-pbssu_binding"];
    const trustedOrigin = loadEnvironment(process.env).TRUSTED_WEB_ORIGIN;
    const trustedRequest = isTrustedCookieReadRequest(
      origin,
      referer,
      fetchSite,
      trustedOrigin,
      true,
    );
    if (
      !trustedRequest ||
      !binding ||
      !csrf ||
      csrf !== cookies["__Host-pbssu_csrf"]
    ) {
      throw new UnauthorizedException("Authentication required");
    }
    await this.identity.authenticateAccessToken(access, binding);
    return access;
  }

  @Get("/incidents")
  @Header("Cache-Control", "no-store")
  @Header("Pragma", "no-cache")
  listIncidents(
    @Headers("authorization") auth: string | undefined,
    @Headers("x-organization-id") org: string,
    @Headers("cookie") cookie: string | undefined,
    @Headers("x-csrf-token") csrf: string | undefined,
    @Headers("origin") origin: string | undefined,
    @Headers("referer") referer: string | undefined,
    @Headers("sec-fetch-site") fetchSite: string | undefined,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
  ) {
    return this.readToken(auth, cookie, csrf, origin, referer, fetchSite).then(
      (token) => this.incidents.listIncidents(token, org, cursor, limit),
    );
  }

  @Post("/incidents")
  createIncident(
    @Headers("authorization") auth: string | undefined,
    @Headers("x-organization-id") org: string,
    @Body() body: unknown,
  ) {
    return this.incidents.createIncident(bearer(auth), org, body);
  }

  @Get("/incidents/:incidentId")
  @Header("Cache-Control", "no-store")
  @Header("Pragma", "no-cache")
  getIncident(
    @Headers("authorization") auth: string | undefined,
    @Headers("x-organization-id") org: string,
    @Param("incidentId") id: string,
    @Headers("cookie") cookie: string | undefined,
    @Headers("x-csrf-token") csrf: string | undefined,
    @Headers("origin") origin: string | undefined,
    @Headers("referer") referer: string | undefined,
    @Headers("sec-fetch-site") fetchSite: string | undefined,
  ) {
    return this.readToken(auth, cookie, csrf, origin, referer, fetchSite).then(
      (token) => this.incidents.getIncident(token, org, id),
    );
  }

  @Patch("/incidents/:incidentId")
  updateIncident(
    @Headers("authorization") auth: string | undefined,
    @Headers("x-organization-id") org: string,
    @Param("incidentId") id: string,
    @Body() body: unknown,
  ) {
    return this.incidents.updateIncident(bearer(auth), org, id, body);
  }

  @Post("/incidents/:incidentId/transitions")
  @HttpCode(200)
  transitionIncident(
    @Headers("authorization") auth: string | undefined,
    @Headers("x-organization-id") org: string,
    @Param("incidentId") id: string,
    @Body() body: unknown,
  ) {
    return this.incidents.transitionIncident(bearer(auth), org, id, body);
  }

  @Get("/incidents/:incidentId/locations")
  listLocations(
    @Headers("authorization") auth: string | undefined,
    @Headers("x-organization-id") org: string,
    @Param("incidentId") id: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
  ) {
    return this.incidents.listLocations(bearer(auth), org, id, cursor, limit);
  }

  @Post("/incidents/:incidentId/locations")
  createLocation(
    @Headers("authorization") auth: string | undefined,
    @Headers("x-organization-id") org: string,
    @Param("incidentId") id: string,
    @Body() body: unknown,
  ) {
    return this.incidents.createLocation(bearer(auth), org, id, body);
  }
}
