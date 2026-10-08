import { Router } from "express";
import { getDb } from "../db/database.js";
import { authenticateToken } from "../middleware/auth.js";
import {
  createSessionToken,
  findUserByEmail,
  getLoginFailureInfo,
  hashPassword,
  needsPasswordRehash,
  resetLoginFailure,
  updateLoginFailure,
  verifyPassword,
  revokeSession,
} from "../services/authService.js";

const router = Router();

router.post("/login", async (req, res) => {
  const email = String(req.body?.email || "").trim();
  const password = String(req.body?.password || "");

  if (!email || !password) {
    return res
      .status(400)
      .json({ message: "Vui lòng nhập email và mật khẩu." });
  }

  const user = findUserByEmail(email);
  if (!user) {
    return res.status(401).json({ message: "Email hoặc mật khẩu không đúng." });
  }

  const lockDeadline = user.locked_until
    ? new Date(user.locked_until).getTime()
    : null;
  if (lockDeadline && lockDeadline > Date.now()) {
    return res.status(423).json({
      message: "Tài khoản đã bị khóa do đăng nhập sai nhiều lần.",
      retryAfterMinutes: Math.max(
        1,
        Math.ceil((lockDeadline - Date.now()) / 60000),
      ),
    });
  }

  const isPasswordValid = await verifyPassword(password, user.password_hash);
  if (!isPasswordValid) {
    const failure = updateLoginFailure(user.id);
    const info = getLoginFailureInfo({
      ...user,
      failed_login_count: failure.failed_login_count,
      locked_until: failure.locked_until,
    });
    if (info.lockedUntil) {
      return res.status(423).json({
        message: "Tài khoản đã bị khóa do đăng nhập sai nhiều lần.",
        retryAfterMinutes: Math.max(
          1,
          Math.ceil(
            (new Date(info.lockedUntil).getTime() - Date.now()) / 60000,
          ),
        ),
      });
    }
    return res.status(401).json({
      message: `Email hoặc mật khẩu không đúng. Còn lại ${info.remainingAttempts} lần thử.`,
      remainingAttempts: info.remainingAttempts,
    });
  }

  resetLoginFailure(user.id);

  if (needsPasswordRehash(user.password_hash)) {
    const upgradedHash = await hashPassword(password);
    getDb()
      .prepare("UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(upgradedHash, user.id);
  }

  const safeUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    organizationId: user.organization_id,
    organizationName: user.organization_name,
    organizationType: user.organization_type,
  };

  const token = createSessionToken(user);
  return res.json({
    token,
    user: safeUser,
    message: "Đăng nhập thành công.",
  });
});

router.post("/logout", authenticateToken, (req, res) => {
  const token = req.headers.authorization?.slice("Bearer ".length);
  if (token) revokeSession(token);
  return res.status(204).end();
});

router.get("/me", authenticateToken, (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      organizationId: req.user.organization_id,
      organizationName: req.user.organization_name,
      organizationType: req.user.organization_type,
    },
  });
});

router.get("/dashboard", authenticateToken, (req, res) => {
  const db = getDb();
  const organizationCondition =
    req.user.role === "auditor" ? "" : "WHERE batches.organization_id = ?";
  const params = req.user.role === "auditor" ? [] : [req.user.organization_id];

  const totals = db
    .prepare(
      `
    SELECT
      COUNT(*) AS total_batches,
      COALESCE(SUM(CASE WHEN batches.status IN ('registered','processed','in_transit') THEN 1 ELSE 0 END), 0) AS active_batches,
      COALESCE(SUM(batches.remaining_quantity), 0) AS remaining_quantity
    FROM batches ${organizationCondition}
  `,
    )
    .get(...params);

  const recentBatches = db
    .prepare(
      `
    SELECT b.*, p.name AS product_name, o.name AS organization_name
    FROM batches b
    INNER JOIN products p ON p.id = b.product_id
    INNER JOIN organizations o ON o.id = b.organization_id
    ${req.user.role === "auditor" ? "" : "WHERE b.organization_id = ?"}
    ORDER BY b.updated_at DESC
    LIMIT 6
  `,
    )
    .all(...params);

  res.json({
    totals,
    recentBatches,
    organization: {
      id: req.user.organization_id,
      name: req.user.organization_name,
      type: req.user.organization_type,
    },
  });
});

export default router;
