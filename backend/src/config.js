import "dotenv/config";

const isTest =
  process.env.NODE_ENV === "test" ||
  process.env.npm_lifecycle_event === "test" ||
  process.execArgv.some((arg) => arg.includes("test")) ||
  process.argv.some((arg) => arg.includes("test") || arg.includes(".test.js"));

export const config = {
  port: Number(process.env.PORT || 3001),
  jwtSecret: process.env.JWT_SECRET || "local-dev-secret-change-me",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "8h",
  sessionMinutes: Number(process.env.SESSION_MINUTES || 480),
  databasePath:
    process.env.DATABASE_PATH ||
    (isTest ? "data/test-agritrace.db" : "data/agritrace.db"),
  loginLockAttempts: Number(process.env.LOGIN_LOCK_ATTEMPTS || 5),
  loginLockMinutes: Number(process.env.LOGIN_LOCK_MINUTES || 15),
};
