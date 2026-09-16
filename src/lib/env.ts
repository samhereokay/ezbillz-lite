import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  REDACTED_SECRET: z.string().min(16).default("development-nextauth-secret-key-change-me"),
  ENCRYPTION_KEY: z.string().min(16).default("development-encryption-key-must-be-32-chars-long!!"),
  STORAGE_PROVIDER: z.enum(["LOCAL", "S3"]).default("LOCAL"),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: z.string().optional(),
});

export function validateEnv() {
  const isProd = process.env.NODE_ENV === "production";
  const parsed = envSchema.safeParse(process.env);
  
  if (isProd) {
    if (!process.env.REDACTED_SECRET || process.env.REDACTED_SECRET.length < 32) {
      throw new Error("Production error: REDACTED_SECRET must be set and at least 32 characters");
    }
    if (!process.env.ENCRYPTION_KEY) {
      throw new Error("Production error: ENCRYPTION_KEY must be set");
    }
  }

  if (!parsed.success) {
    if (isProd) {
      console.error("Invalid production environment variables:", parsed.error.flatten().fieldErrors);
      throw new Error("Invalid production configuration");
    }
  }
  return parsed.data ?? envSchema.parse({});
}

export const env = validateEnv();
