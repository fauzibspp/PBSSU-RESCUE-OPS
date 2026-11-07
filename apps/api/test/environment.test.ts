import { describe, expect, it } from "vitest";
import { Test } from "@nestjs/testing";
import { hash, verify, argon2id } from "argon2";
import { AppModule } from "../src/app.module.js";
import { loadEnvironment } from "../src/config.js";

const valid = {
  DATABASE_URL: "postgresql://runtime:synthetic@127.0.0.1:55441/pbssu",
  IDENTITY_DATABASE_URL:
    "postgresql://identity:synthetic@127.0.0.1:55441/pbssu",
  MIGRATION_DATABASE_URL: "postgresql://owner:synthetic@127.0.0.1:55441/pbssu",
};

describe("M01-A local configuration", () => {
  it("accepts isolated local mock-only configuration", () => {
    expect(loadEnvironment(valid)).toMatchObject({
      HOST: "127.0.0.1",
      MAIL_MODE: "mock",
    });
  });

  it.each([
    { HOST: "0.0.0.0" },
    { NODE_ENV: "production" },
    { MAIL_MODE: "smtp" },
    { DATABASE_URL: "INVALID_SYNTHETIC_CONFIGURATION" },
    {
      DATABASE_URL:
        "postgresql://runtime:synthetic@external.example.invalid/pbssu",
    },
    { IDENTITY_DATABASE_URL: valid.DATABASE_URL },
  ])("fails closed without exposing configuration values", (override) => {
    expect(() => loadEnvironment({ ...valid, ...override })).toThrow(
      "Invalid local development configuration",
    );
  });

  it("does not include migration credentials in runtime configuration", () => {
    expect(loadEnvironment(valid)).not.toHaveProperty("MIGRATION_DATABASE_URL");
  });

  it("loads the pinned NestJS module", async () => {
    process.env.NODE_ENV = "test";
    process.env.HOST = "127.0.0.1";
    process.env.PORT = "3301";
    process.env.MAIL_MODE = "mock";
    process.env.TRUSTED_WEB_ORIGIN = "http://127.0.0.1:5173";
    process.env.DATABASE_URL = valid.DATABASE_URL;
    process.env.IDENTITY_DATABASE_URL = valid.IDENTITY_DATABASE_URL;
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    expect(module.get(AppModule)).toBeInstanceOf(AppModule);
    await module.close();
  });

  it("loads native Argon2id on Node24 and verifies a synthetic password", async () => {
    const encoded = await hash("SYNTHETIC_NOT_A_REAL_PASSWORD", {
      type: argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 1,
    });
    expect(encoded.startsWith("$argon2id$")).toBe(true);
    expect(await verify(encoded, "SYNTHETIC_NOT_A_REAL_PASSWORD")).toBe(true);
    expect(await verify(encoded, "SYNTHETIC_WRONG_PASSWORD")).toBe(false);
  });
});
