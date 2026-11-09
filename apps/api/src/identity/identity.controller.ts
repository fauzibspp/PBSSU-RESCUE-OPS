import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  InternalServerErrorException,
  Param,
  Post,
  PipeTransform,
  Query,
  Res,
} from "@nestjs/common";
import { parseCookie } from "cookie";
import type { Response } from "express";
import { IdentityService } from "./identity.service.js";
import { loadEnvironment } from "../config.js";

function bindingValue(value: string | undefined): string {
  if (!value || Buffer.from(value, "base64url").length < 32) {
    throw new BadRequestException("Invalid request");
  }
  return value;
}

function trustedOrigin(): string {
  return loadEnvironment(process.env).TRUSTED_WEB_ORIGIN;
}

function bearerToken(value: string | undefined): string {
  const token = value?.match(/^Bearer ([A-Za-z0-9._~-]+)$/)?.[1];
  if (!token) {
    throw new BadRequestException("Authentication required");
  }
  return token;
}

class JsonObjectPipe implements PipeTransform<
  unknown,
  Record<string, unknown>
> {
  transform(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new BadRequestException("Invalid request");
    }
    return value as Record<string, unknown>;
  }
}

@Controller()
export class IdentityController {
  constructor(private readonly identity: IdentityService) {}

  private async authenticatedToken(
    authorization: string | undefined,
    cookieHeader: string | undefined,
    csrf: string | undefined,
    origin: string | undefined,
    fetchSite?: string,
    originlessRead = false,
  ): Promise<string> {
    const cookies = parseCookie(cookieHeader ?? "");
    const access = cookies["__Host-pbssu_access"];
    if (!access) {
      return bearerToken(authorization);
    }
    const binding = cookies["__Host-pbssu_binding"];
    const trustedRequest =
      origin === trustedOrigin() ||
      (originlessRead && origin === undefined && fetchSite === "same-origin");
    if (
      !trustedRequest ||
      !binding ||
      !csrf ||
      csrf !== cookies["__Host-pbssu_csrf"]
    ) {
      throw new BadRequestException("Authentication required");
    }
    await this.identity.authenticateAccessToken(access, binding);
    return access;
  }

  @Post("auth/login")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  @Header("Pragma", "no-cache")
  login(@Body(new JsonObjectPipe()) body: Record<string, unknown>) {
    return this.identity.login(body);
  }

  @Post("auth/refresh")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  @Header("Pragma", "no-cache")
  async refreshSession(
    @Headers("x-refresh-token") refreshHeader: string | undefined,
    @Headers("x-csrf-token") csrf: string | undefined,
    @Headers("origin") origin: string | undefined,
    @Headers("cookie") cookieHeader: string | undefined,
  ) {
    const cookies = parseCookie(cookieHeader ?? "");
    const webToken = cookies["__Host-pbssu_refresh"];
    const webBinding = cookies["__Host-pbssu_binding"];
    if (webToken || webBinding) {
      if (
        origin !== trustedOrigin() ||
        !webToken ||
        !webBinding ||
        !csrf ||
        csrf !== cookies["__Host-pbssu_csrf"]
      ) {
        throw new BadRequestException("Invalid request");
      }
      return this.identity.refreshSession(webToken, "WEB", webBinding);
    }
    if (!refreshHeader || refreshHeader.length < 40) {
      throw new BadRequestException("Invalid request");
    }
    return this.identity.refreshSession(refreshHeader, "MOBILE");
  }

  @Post("auth/logout")
  async revokeSession(
    @Headers("authorization") authorization: string | undefined,
    @Headers("x-refresh-token") refreshHeader: string | undefined,
    @Headers("x-csrf-token") csrf: string | undefined,
    @Headers("origin") origin: string | undefined,
    @Headers("cookie") cookieHeader: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const cookies = parseCookie(cookieHeader ?? "");
    const cookieAccess = cookies["__Host-pbssu_access"];
    const cookieRefresh = cookies["__Host-pbssu_refresh"];
    const cookieBinding = cookies["__Host-pbssu_binding"];
    if (cookieAccess || cookieRefresh) {
      if (
        origin !== trustedOrigin() ||
        !cookieBinding ||
        !csrf ||
        csrf !== cookies["__Host-pbssu_csrf"]
      ) {
        throw new BadRequestException("Invalid request");
      }
    }
    const bearer = authorization?.match(/^Bearer ([A-Za-z0-9._~-]+)$/)?.[1];
    await this.identity.revokeSession(
      refreshHeader ?? cookieRefresh,
      bearer ?? cookieAccess,
      cookieBinding,
    );
    for (const name of [
      "__Host-pbssu_access",
      "__Host-pbssu_refresh",
      "__Host-pbssu_binding",
      "__Host-pbssu_csrf",
    ]) {
      response.clearCookie(name, {
        secure: true,
        httpOnly: name !== "__Host-pbssu_csrf",
        sameSite: "strict",
        path: "/",
      });
    }
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Pragma", "no-cache");
    response.status(204).end();
  }

  @Get("auth/sessions")
  async listSessions(
    @Headers("authorization") authorization: string | undefined,
    @Headers("cookie") cookieHeader: string | undefined,
    @Headers("x-csrf-token") csrf: string | undefined,
    @Headers("origin") origin: string | undefined,
    @Headers("sec-fetch-site") fetchSite: string | undefined,
  ) {
    return this.identity.listSessions(
      await this.authenticatedToken(
        authorization,
        cookieHeader,
        csrf,
        origin,
        fetchSite,
        true,
      ),
    );
  }

  @Post("auth/sessions/:sessionId/revoke")
  async revokeOwnedSession(
    @Param("sessionId") sessionId: string,
    @Headers("authorization") authorization: string | undefined,
    @Headers("x-csrf-token") csrf: string | undefined,
    @Headers("origin") origin: string | undefined,
    @Headers("cookie") cookieHeader: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const cookies = parseCookie(cookieHeader ?? "");
    if (cookies["__Host-pbssu_access"]) {
      if (
        origin !== trustedOrigin() ||
        !cookies["__Host-pbssu_binding"] ||
        !csrf ||
        csrf !== cookies["__Host-pbssu_csrf"]
      ) {
        throw new BadRequestException("Invalid request");
      }
    }
    const token =
      authorization?.match(/^Bearer ([A-Za-z0-9._~-]+)$/)?.[1] ??
      cookies["__Host-pbssu_access"];
    if (!token) {
      throw new BadRequestException("Invalid request");
    }
    if (cookies["__Host-pbssu_access"]) {
      await this.identity.authenticateAccessToken(
        token,
        cookies["__Host-pbssu_binding"],
      );
    }
    await this.identity.revokeOwnedSession(token, sessionId);
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Pragma", "no-cache");
    response.status(204).end();
  }

  @Post("auth/sessions/revoke-all")
  async revokeAllSessions(
    @Headers("authorization") authorization: string | undefined,
    @Headers("x-csrf-token") csrf: string | undefined,
    @Headers("origin") origin: string | undefined,
    @Headers("cookie") cookieHeader: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const cookies = parseCookie(cookieHeader ?? "");
    if (cookies["__Host-pbssu_access"]) {
      if (
        origin !== trustedOrigin() ||
        !cookies["__Host-pbssu_binding"] ||
        !csrf ||
        csrf !== cookies["__Host-pbssu_csrf"]
      ) {
        throw new BadRequestException("Invalid request");
      }
    }
    const token =
      authorization?.match(/^Bearer ([A-Za-z0-9._~-]+)$/)?.[1] ??
      cookies["__Host-pbssu_access"];
    if (!token) {
      throw new BadRequestException("Invalid request");
    }
    if (cookies["__Host-pbssu_access"]) {
      await this.identity.authenticateAccessToken(
        token,
        cookies["__Host-pbssu_binding"],
      );
    }
    await this.identity.revokeAllSessions(token);
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Pragma", "no-cache");
    response.status(204).end();
  }

  @Post("auth/mfa/enrollments")
  @HttpCode(202)
  @Header("Cache-Control", "no-store")
  @Header("Pragma", "no-cache")
  startMfaEnrollment(
    @Body(new JsonObjectPipe()) body: Record<string, unknown>,
    @Headers("x-auth-challenge-binding") binding: string | undefined,
  ) {
    return this.identity.startMfaEnrollment(body, bindingValue(binding));
  }

  @Post("auth/password-reset/requests")
  requestPasswordReset(
    @Body(new JsonObjectPipe()) body: Record<string, unknown>,
  ) {
    return this.identity.requestPasswordReset(body);
  }

  @Post("auth/invitations/accept")
  acceptInvitation(
    @Body(new JsonObjectPipe()) body: Record<string, unknown>,
    @Headers("authorization") authorization: string | undefined,
  ) {
    const token = authorization?.match(/^Bearer ([A-Za-z0-9._~-]+)$/)?.[1];
    return this.identity.acceptInvitation(body, token);
  }

  @Post("auth/invitations/activate")
  activateInvitation(
    @Body(new JsonObjectPipe()) body: Record<string, unknown>,
    @Headers("x-auth-challenge-binding") binding: string | undefined,
  ) {
    return this.identity.activateInvitation(body, bindingValue(binding));
  }

  @Post("auth/password-reset/confirm")
  confirmPasswordReset(
    @Body(new JsonObjectPipe()) body: Record<string, unknown>,
  ) {
    return this.identity.confirmPasswordReset(body);
  }

  @Post("auth/email-verification/requests")
  requestEmailVerification(
    @Body(new JsonObjectPipe()) body: Record<string, unknown>,
  ) {
    return this.identity.requestEmailVerification(body);
  }

  @Post("auth/email-verification/confirm")
  confirmEmailVerification(
    @Body(new JsonObjectPipe()) body: Record<string, unknown>,
  ) {
    return this.identity.confirmEmailVerification(body);
  }

  @Get("auth/mfa")
  async getMfaStatus(
    @Headers("authorization") authorization: string | undefined,
    @Headers("cookie") cookieHeader: string | undefined,
    @Headers("x-csrf-token") csrf: string | undefined,
    @Headers("origin") origin: string | undefined,
    @Headers("sec-fetch-site") fetchSite: string | undefined,
  ) {
    return this.identity.getMfaStatus(
      await this.authenticatedToken(
        authorization,
        cookieHeader,
        csrf,
        origin,
        fetchSite,
        true,
      ),
    );
  }

  @Get("me/memberships")
  async listMyMemberships(
    @Headers("authorization") authorization: string | undefined,
    @Query("cursor") cursor: string | undefined,
    @Query("limit") limit: string | undefined,
    @Headers("cookie") cookieHeader: string | undefined,
    @Headers("x-csrf-token") csrf: string | undefined,
    @Headers("origin") origin: string | undefined,
    @Headers("sec-fetch-site") fetchSite: string | undefined,
  ) {
    return this.identity.listMyMemberships(
      await this.authenticatedToken(
        authorization,
        cookieHeader,
        csrf,
        origin,
        fetchSite,
        true,
      ),
      cursor,
      limit,
    );
  }

  @Post("auth/password/change")
  async changePassword(
    @Body(new JsonObjectPipe()) body: Record<string, unknown>,
    @Headers("authorization") authorization: string | undefined,
    @Headers("cookie") cookieHeader: string | undefined,
    @Headers("x-csrf-token") csrf: string | undefined,
    @Headers("origin") origin: string | undefined,
  ) {
    return this.identity.changePassword(
      await this.authenticatedToken(authorization, cookieHeader, csrf, origin),
      body,
    );
  }

  @Post("auth/email/change")
  async requestEmailChange(
    @Body(new JsonObjectPipe()) body: Record<string, unknown>,
    @Headers("authorization") authorization: string | undefined,
    @Headers("cookie") cookieHeader: string | undefined,
    @Headers("x-csrf-token") csrf: string | undefined,
    @Headers("origin") origin: string | undefined,
  ) {
    return this.identity.requestEmailChange(
      await this.authenticatedToken(authorization, cookieHeader, csrf, origin),
      body,
    );
  }

  @Post("auth/email/change/confirm")
  async confirmEmailChange(
    @Body(new JsonObjectPipe()) body: Record<string, unknown>,
    @Headers("authorization") authorization: string | undefined,
    @Headers("cookie") cookieHeader: string | undefined,
    @Headers("x-csrf-token") csrf: string | undefined,
    @Headers("origin") origin: string | undefined,
  ) {
    return this.identity.confirmEmailChange(
      await this.authenticatedToken(authorization, cookieHeader, csrf, origin),
      body,
    );
  }

  @Post("auth/mfa/enrollments/confirm")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  @Header("Pragma", "no-cache")
  confirmMfaEnrollment(
    @Body(new JsonObjectPipe()) body: Record<string, unknown>,
    @Headers("x-auth-challenge-binding") binding: string | undefined,
  ) {
    return this.identity.confirmMfaEnrollment(body, bindingValue(binding));
  }

  @Post("auth/mfa/verify")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  @Header("Pragma", "no-cache")
  verifyMfa(
    @Body(new JsonObjectPipe()) body: Record<string, unknown>,
    @Headers("x-auth-challenge-binding") binding: string | undefined,
  ) {
    return this.identity.verifyMfa(body, bindingValue(binding));
  }

  @Post("auth/mfa/recovery-codes/redeem")
  redeemRecoveryCode(
    @Body(new JsonObjectPipe()) body: Record<string, unknown>,
    @Headers("x-auth-challenge-binding") binding: string | undefined,
  ) {
    return this.identity.redeemRecoveryCode(body, bindingValue(binding));
  }

  @Post("auth/reauthenticate")
  async reauthenticate(
    @Body(new JsonObjectPipe()) body: Record<string, unknown>,
    @Headers("authorization") authorization: string | undefined,
    @Headers("cookie") cookieHeader: string | undefined,
    @Headers("x-csrf-token") csrf: string | undefined,
    @Headers("origin") origin: string | undefined,
  ) {
    return this.identity.reauthenticate(
      await this.authenticatedToken(authorization, cookieHeader, csrf, origin),
      body,
    );
  }

  @Post("auth/mfa/recovery-codes/rotate")
  async rotateRecoveryCodes(
    @Body(new JsonObjectPipe()) body: Record<string, unknown>,
    @Headers("authorization") authorization: string | undefined,
    @Headers("cookie") cookieHeader: string | undefined,
    @Headers("x-csrf-token") csrf: string | undefined,
    @Headers("origin") origin: string | undefined,
  ) {
    return this.identity.rotateRecoveryCodes(
      await this.authenticatedToken(authorization, cookieHeader, csrf, origin),
      body,
    );
  }

  @Post("auth/mfa/replacement")
  @HttpCode(202)
  @Header("Cache-Control", "no-store")
  @Header("Pragma", "no-cache")
  async startMfaReplacement(
    @Body(new JsonObjectPipe()) body: Record<string, unknown>,
    @Headers("authorization") authorization: string | undefined,
    @Headers("cookie") cookieHeader: string | undefined,
    @Headers("x-csrf-token") csrf: string | undefined,
    @Headers("origin") origin: string | undefined,
  ) {
    return this.identity.startMfaReplacement(
      await this.authenticatedToken(authorization, cookieHeader, csrf, origin),
      body,
    );
  }

  @Post("auth/mfa/replacement/confirm")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  @Header("Pragma", "no-cache")
  confirmMfaReplacement(
    @Body(new JsonObjectPipe()) body: Record<string, unknown>,
    @Headers("x-auth-challenge-binding") binding: string | undefined,
  ) {
    return this.identity.confirmMfaEnrollment(
      body,
      bindingValue(binding),
      "FACTOR_REPLACE",
    );
  }

  @Post("auth/credential-handoffs/:handoffId/redeem")
  async redeemCredentialHandoff(
    @Param("handoffId") handoffId: string,
    @Body(new JsonObjectPipe()) body: Record<string, unknown>,
    @Headers("x-auth-challenge-binding") bindingHeader: string | undefined,
    @Headers("x-csrf-token") csrf: string | undefined,
    @Headers("origin") origin: string | undefined,
    @Headers("cookie") cookieHeader: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const cookies = parseCookie(cookieHeader ?? "");
    const binding = bindingHeader ?? cookies["__Host-pbssu_binding"];
    const material = await this.identity.redeemCredentialHandoff(
      handoffId,
      body,
      bindingValue(binding),
      cookies,
      csrf,
      origin,
      response,
    );
    if (material === null) {
      response.status(204).end();
      return;
    }
    let credentialMaterial = material;
    if (body.purpose === "TOTP_SETUP") {
      if (
        material.kind !== "TOTP_SETUP" ||
        typeof material.secret !== "string" ||
        typeof material.enrollment_id !== "string" ||
        typeof material.otpauth_uri !== "string" ||
        typeof material.expires_at !== "string"
      ) {
        throw new InternalServerErrorException(
          "Credential material unavailable",
        );
      }
      credentialMaterial = {
        kind: material.kind,
        enrollment_id: material.enrollment_id,
        totp_secret: material.secret,
        otpauth_uri: material.otpauth_uri,
        expires_at: material.expires_at,
      };
    }
    response
      .status(200)
      .setHeader(
        "Content-Type",
        "application/vnd.pbssu.credential-material+json",
      )
      .json(credentialMaterial);
  }
}
