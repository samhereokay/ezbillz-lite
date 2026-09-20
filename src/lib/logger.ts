import "server-only";
import pino from "pino";

// The logger should prevent sensitive values from entering logs in the first place,
// but Pino redaction acts as a secondary safety net.
export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  formatters: {
    level: (label) => {
      return { level: label.toUpperCase() };
    },
  },
  redact: {
    paths: [
      "password",
      "passwordHash",
      "access_token",
      "refresh_token",
      "jwt",
      "cookie",
      "req.headers.cookie",
      "req.headers.authorization",
      "authorization",
      "NEXTAUTH_SECRET",
      "ENCRYPTION_KEY",
      "DATABASE_URL",
      "credentials.password",
      "credentials.email"
    ],
    censor: "[REDACTED]"
  }
});
