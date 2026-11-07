import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { loadEnvironment } from "./config.js";
import type { NextFunction, Request, Response } from "express";

async function bootstrap(): Promise<void> {
  const config = loadEnvironment(process.env);
  const app = await NestFactory.create(AppModule, { logger: false });
  app.enableCors({
    origin: config.TRUSTED_WEB_ORIGIN,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE"],
    allowedHeaders: [
      "Authorization",
      "Content-Type",
      "X-Organization-Id",
      "X-Auth-Challenge-Binding",
      "X-Refresh-Token",
      "X-CSRF-Token",
    ],
  });
  app.use((_request: Request, response: Response, next: NextFunction) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Pragma", "no-cache");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    next();
  });
  app.enableShutdownHooks();
  await app.listen(config.PORT, config.HOST);
}

bootstrap().catch(() => {
  process.stderr.write("PBSSU local startup failed\n");
  process.exitCode = 1;
});
