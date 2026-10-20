import "dotenv/config";

export const config = {
  port: Number(process.env.PORT || 3001),
  jwtSecret: process.env.JWT_SECRET || "local-dev-secret-change-me",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "8h",
  databasePath: process.env.DATABASE_PATH || "data/agritrace.db",
  loginLockAttempts: Number(process.env.LOGIN_LOCK_ATTEMPTS || 5),
  loginLockMinutes: Number(process.env.LOGIN_LOCK_MINUTES || 15),
};
