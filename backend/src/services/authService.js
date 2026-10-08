import bcrypt from "bcryptjs";
import argon2 from "argon2";
import { randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import { getDb } from "../db/database.js";
import { config } from "../config.js";
import { sha256 } from "../utils/hash.js";

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

export function hashPassword(password) {
  return argon2.hash(password, { type: argon2.argon2id });
}

export function createSessionToken(user) {
  getDb().prepare("DELETE FROM sessions WHERE expires_at <= ?").run(new Date().toISOString());
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(
    Date.now() + config.sessionMinutes * 60 * 1000,
  ).toISOString();
  getDb()
    .prepare(
      "INSERT INTO sessions(token_hash, user_id, expires_at) VALUES (?, ?, ?)",
    )
    .run(sha256(token), user.id, expiresAt);
  return token;
}

export function findSessionByToken(token) {
  return getDb()
    .prepare(
      "SELECT user_id, expires_at FROM sessions WHERE token_hash = ? AND expires_at > ?",
    )
    .get(sha256(token), new Date().toISOString());
}

export function revokeSession(token) {
  getDb().prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha256(token));
}

export function verifyPassword(inputPassword, hash) {
  if (hash?.startsWith("$argon2")) {
    return argon2.verify(hash, inputPassword);
  }
  // Existing demo databases contain bcrypt hashes. They are upgraded after
  // the next successful login in authRoutes.js.
  return bcrypt.compare(inputPassword, hash);
}

export function needsPasswordRehash(hash) {
  return !hash?.startsWith("$argon2");
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
