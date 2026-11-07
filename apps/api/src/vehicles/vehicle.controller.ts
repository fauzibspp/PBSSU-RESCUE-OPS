import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { VehicleService } from "./vehicle.service.js";

function bearer(value: string | undefined): string {
  const token = value?.match(/^Bearer ([A-Za-z0-9._~-]+)$/)?.[1];
  if (!token) throw new BadRequestException("Authentication required");
  return token;
}

@Controller()
export class VehicleController {
  constructor(private readonly vehicles: VehicleService) {}

  @Get("/vehicles")
  listVehicles(
    @Headers("authorization") authorization: string | undefined,
    @Headers("x-organization-id") organizationId: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
  ) {
    return this.vehicles.listVehicles(
      bearer(authorization),
      organizationId,
      cursor,
      limit,
    );
  }

  @Post("/vehicles")
  createVehicle(
    @Headers("authorization") authorization: string | undefined,
    @Headers("x-organization-id") organizationId: string,
    @Body() body: unknown,
  ) {
    return this.vehicles.createVehicle(
      bearer(authorization),
      organizationId,
      body,
    );
  }

  @Patch("/vehicles/:vehicleId")
  updateVehicle(
    @Headers("authorization") authorization: string | undefined,
    @Headers("x-organization-id") organizationId: string,
    @Param("vehicleId") vehicleId: string,
    @Body() body: unknown,
  ) {
    return this.vehicles.updateVehicle(
      bearer(authorization),
      organizationId,
      vehicleId,
      body,
    );
  }
}
