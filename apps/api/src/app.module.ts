import "reflect-metadata";
import { Module } from "@nestjs/common";
import { IdentityController } from "./identity/identity.controller.js";
import { IdentityService } from "./identity/identity.service.js";
import { OrganizationController } from "./organizations/organization.controller.js";
import { OrganizationService } from "./organizations/organization.service.js";
import { VehicleController } from "./vehicles/vehicle.controller.js";
import { VehicleService } from "./vehicles/vehicle.service.js";
import { IncidentController } from "./incidents/incident.controller.js";
import { IncidentService } from "./incidents/incident.service.js";
import { AssignmentController } from "./assignments/assignment.controller.js";
import { AssignmentService } from "./assignments/assignment.service.js";
import { MovementController } from "./movements/movement.controller.js";
import { MovementService } from "./movements/movement.service.js";

@Module({
  controllers: [
    IdentityController,
    OrganizationController,
    VehicleController,
    IncidentController,
    AssignmentController,
    MovementController,
  ],
  providers: [
    IdentityService,
    OrganizationService,
    VehicleService,
    IncidentService,
    AssignmentService,
    MovementService,
  ],
})
export class AppModule {}
