import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  UnauthorizedException,
  UseFilters,
} from "@nestjs/common";
import { IncidentErrorFilter } from "../incidents/incident-error.filter.js";
import { MovementService } from "./movement.service.js";

function bearer(value: string | undefined): string {
  const token = value?.match(/^Bearer ([A-Za-z0-9._~-]+)$/)?.[1];
  if (!token) throw new UnauthorizedException("Authentication required");
  return token;
}

@Controller()
@UseFilters(IncidentErrorFilter)
export class MovementController {
  constructor(private readonly movements: MovementService) {}

  @Get("/incidents/:incidentId/movements")
  listMovements(
    @Headers("authorization") authorization: string | undefined,
    @Headers("x-organization-id") organizationId: string,
    @Param("incidentId") incidentId: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
  ) {
    return this.movements.listMovements(
      bearer(authorization),
      organizationId,
      incidentId,
      cursor,
      limit,
    );
  }

  @Post("/incidents/:incidentId/movements")
  createMovement(
    @Headers("authorization") authorization: string | undefined,
    @Headers("x-organization-id") organizationId: string,
    @Param("incidentId") incidentId: string,
    @Body() body: unknown,
  ) {
    return this.movements.createMovement(
      bearer(authorization),
      organizationId,
      incidentId,
      body,
    );
  }
}
