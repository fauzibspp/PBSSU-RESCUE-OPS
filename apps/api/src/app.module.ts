import "reflect-metadata";
import { Module } from "@nestjs/common";
import { IdentityController } from "./identity/identity.controller.js";
import { IdentityService } from "./identity/identity.service.js";
import { OrganizationController } from "./organizations/organization.controller.js";
import { OrganizationService } from "./organizations/organization.service.js";

@Module({
  controllers: [IdentityController, OrganizationController],
  providers: [IdentityService, OrganizationService],
})
export class AppModule {}
