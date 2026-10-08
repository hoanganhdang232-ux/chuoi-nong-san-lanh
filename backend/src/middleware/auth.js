import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { getDb } from "../db/database.js";
import { requireOrganizationAccess } from "../utils/authorization.js";
import { findSessionByToken } from "../services/authService.js";

export function authenticateToken(req, res, next) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: "Token không hợp lệ." });
  }

  try {
    let userId;
    try {
      userId = jwt.verify(token, config.jwtSecret).sub;
    } catch {
      const session = findSessionByToken(token);
      if (!session) throw new Error("Invalid session");
      userId = session.user_id;
    }
    const db = getDb();
    const user = db
      .prepare(
        `
      SELECT u.*, o.type AS organization_type, o.name AS organization_name
      FROM users u
      INNER JOIN organizations o ON o.id = u.organization_id
      WHERE u.id = ? AND u.is_active = 1
    `,
      )
      .get(userId);

    if (!user) {
      return res
        .status(401)
        .json({ message: "Tài khoản không còn hoạt động." });
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

    req.user = user;
    next();
  } catch {
    return res
      .status(401)
      .json({ message: "Phiên đăng nhập không hợp lệ hoặc đã hết hạn." });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res
        .status(403)
        .json({ message: "Bạn không có quyền thực hiện thao tác này." });
    }
    next();
  };
}

export function requireOrganizationScope(
  organizationIdParam = "organizationId",
) {
  return (req, res, next) => {
    const organizationId = Number(
      req.params[organizationIdParam] || req.query.organizationId,
    );
    if (
      !organizationId ||
      !requireOrganizationAccess(req.user, organizationId)
    ) {
      return res
        .status(403)
        .json({ message: "Bạn không có quyền truy cập tổ chức này." });
    }
    next();
  };
}
