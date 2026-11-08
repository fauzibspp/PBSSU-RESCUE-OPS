import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UnauthorizedException,
  UseFilters,
} from "@nestjs/common";
import { IncidentService } from "./incident.service.js";
import { IncidentErrorFilter } from "./incident-error.filter.js";

function bearer(value: string | undefined): string {
  const token = value?.match(/^Bearer ([A-Za-z0-9._~-]+)$/)?.[1];
  if (!token) throw new UnauthorizedException("Authentication required");
  return token;
}

@Controller()
@UseFilters(IncidentErrorFilter)
export class IncidentController {
  constructor(private readonly incidents: IncidentService) {}

  @Get("/incidents")
  listIncidents(
    @Headers("authorization") auth: string | undefined,
    @Headers("x-organization-id") org: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
  ) {
    return this.incidents.listIncidents(bearer(auth), org, cursor, limit);
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
  getIncident(
    @Headers("authorization") auth: string | undefined,
    @Headers("x-organization-id") org: string,
    @Param("incidentId") id: string,
  ) {
    return this.incidents.getIncident(bearer(auth), org, id);
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
