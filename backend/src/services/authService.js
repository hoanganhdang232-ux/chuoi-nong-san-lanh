import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { getDb } from "../db/database.js";
import { config } from "../config.js";

export function createToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn },
  );
}

export function findUserByEmail(email) {
  const db = getDb();
  return db
    .prepare(
      `
    SELECT u.*, o.type AS organization_type, o.name AS organization_name
    FROM users u
    INNER JOIN organizations o ON o.id = u.organization_id
    WHERE LOWER(u.email) = LOWER(?)
  `,
    )
    .get(email);
}

export function updateLoginFailure(userId) {
  const db = getDb();

  const nextLockDeadline = new Date(
    Date.now() + config.loginLockMinutes * 60 * 1000,
  ).toISOString();
  return db
    .prepare(
      `
      UPDATE users
      SET failed_login_count = failed_login_count + 1,
          locked_until = CASE WHEN failed_login_count + 1 >= ? THEN ? ELSE NULL END,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      RETURNING failed_login_count, locked_until
      `,
    )
    .get(config.loginLockAttempts, nextLockDeadline, userId);
}

export function resetLoginFailure(userId) {
  const db = getDb();
  db.prepare(
    `
    UPDATE users
    SET failed_login_count = 0, locked_until = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `,
  ).run(userId);
}

export function verifyPassword(inputPassword, hash) {
  return bcrypt.compare(inputPassword, hash);
}

export function getLoginFailureInfo(user) {
  const remaining = Math.max(
    0,
    config.loginLockAttempts - Number(user.failed_login_count),
  );
  return {
    remainingAttempts: remaining,
    lockedUntil: user.locked_until,
  };
}
