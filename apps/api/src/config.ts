import { z } from "zod";

const localDatabase = z
  .string()
  .url()
  .refine((value) => {
    try {
      const parsed = new URL(value);
      return (
        parsed.protocol === "postgresql:" &&
        ["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname)
      );
    } catch {
      return false;
    }
  });

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test"]).default("development"),
    HOST: z.literal("127.0.0.1").default("127.0.0.1"),
    PORT: z.coerce.number().int().min(1024).max(65535).default(3301),
    MAIL_MODE: z.literal("mock").default("mock"),
    TRUSTED_WEB_ORIGIN: z
      .string()
      .url()
      .default("http://127.0.0.1:5173")
      .refine((value) => {
        try {
          const parsed = new URL(value);
          return (
            parsed.protocol === "http:" &&
            ["127.0.0.1", "localhost"].includes(parsed.hostname)
          );
        } catch {
          return false;
        }
      }),
    DATABASE_URL: localDatabase,
    IDENTITY_DATABASE_URL: localDatabase,
  })
  .refine((value) => {
    try {
      return (
        new URL(value.DATABASE_URL).username !==
        new URL(value.IDENTITY_DATABASE_URL).username
      );
    } catch {
      return false;
    }
  });

export type Environment = z.infer<typeof environmentSchema>;

export function loadEnvironment(input: NodeJS.ProcessEnv): Environment {
  const result = environmentSchema.safeParse(input);
  if (!result.success) {
    throw new Error("Invalid local development configuration");
  }
  return result.data;
}
