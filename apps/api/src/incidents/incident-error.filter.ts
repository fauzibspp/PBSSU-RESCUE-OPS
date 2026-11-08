import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Response } from "express";

@Catch()
export class IncidentErrorFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const status =
      error instanceof HttpException
        ? error.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const payload =
      error instanceof HttpException ? error.getResponse() : undefined;
    const detail =
      typeof payload === "object" && payload !== null
        ? (payload as Record<string, unknown>)
        : {};
    const allowedCodes = new Set([
      "STALE_VERSION",
      "INVALID_TRANSITION",
      "PREREQUISITE_UNAVAILABLE",
    ]);
    const code =
      typeof detail.code === "string" && allowedCodes.has(detail.code)
        ? detail.code
        : status === 400
          ? "INVALID_REQUEST"
          : status === 401
            ? "AUTHENTICATION_REQUIRED"
            : status === 403
              ? "ACCESS_DENIED"
              : status === 404
                ? "NOT_FOUND"
                : status === 409
                  ? "CONFLICT"
                  : status >= 500
                    ? "INTERNAL_ERROR"
                    : "REQUEST_REJECTED";
    const safeMessage =
      code === "STALE_VERSION" ||
      code === "INVALID_TRANSITION" ||
      code === "PREREQUISITE_UNAVAILABLE"
        ? String(detail.message)
        : status >= 500
          ? "Request could not be completed"
          : "Request rejected";
    const correlation =
      typeof detail.correlation_id === "string"
        ? detail.correlation_id
        : randomUUID();
    response.status(status).json({
      code,
      message: safeMessage.slice(0, 500),
      correlation_id: correlation,
      ...(code === "STALE_VERSION" && Number.isInteger(detail.current_version)
        ? { current_version: detail.current_version }
        : {}),
    });
    // No request body, query, exception detail, or operational reason is logged.
  }
}
