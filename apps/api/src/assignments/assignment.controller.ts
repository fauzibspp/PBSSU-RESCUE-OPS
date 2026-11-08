import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Put,
  UnauthorizedException,
  UseFilters,
} from "@nestjs/common";
import { IncidentErrorFilter } from "../incidents/incident-error.filter.js";
import { AssignmentService } from "./assignment.service.js";

function bearer(value: string | undefined): string {
  const token = value?.match(/^Bearer ([A-Za-z0-9._~-]+)$/)?.[1];
  if (!token) throw new UnauthorizedException("Authentication required");
  return token;
}

@Controller()
@UseFilters(IncidentErrorFilter)
export class AssignmentController {
  constructor(private readonly assignments: AssignmentService) {}

  @Get("/incidents/:incidentId/assignments")
  getAssignments(
    @Headers("authorization") authorization: string | undefined,
    @Headers("x-organization-id") organizationId: string,
    @Param("incidentId") incidentId: string,
  ) {
    return this.assignments.getAssignments(
      bearer(authorization),
      organizationId,
      incidentId,
    );
  }

  @Put("/incidents/:incidentId/assignments")
  setAssignments(
    @Headers("authorization") authorization: string | undefined,
    @Headers("x-organization-id") organizationId: string,
    @Param("incidentId") incidentId: string,
    @Body() body: unknown,
  ) {
    return this.assignments.setAssignments(
      bearer(authorization),
      organizationId,
      incidentId,
      body,
    );
  }
}
