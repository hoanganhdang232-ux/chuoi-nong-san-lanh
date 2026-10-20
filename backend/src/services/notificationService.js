import { getDb } from "../db/database.js";

/**
 * SCRUM-174 / T-85: Notification Service.
 * Tự động tạo và quản lý thông báo in-app cho người dùng và tổ chức.
 */

export function sendNotificationToOrg({ orgId, title, message, type = "recall", kind = "recall" }) {
  const db = getDb();
  const users = db
    .prepare("SELECT id, organization_id FROM users WHERE organization_id = ? AND is_active = 1")
    .all(orgId);

  const stmt = db.prepare(
    `INSERT INTO notifications (user_id, organization_id, org_id, kind, type, title, message, is_read, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP)`,
  );

  for (const user of users) {
    stmt.run(user.id, user.organization_id, user.organization_id, kind, type, title, message);
  }
}

export function sendNotificationToAuditors({ title, message, type = "recall", kind = "recall" }) {
  const db = getDb();
  const auditors = db
    .prepare("SELECT id, organization_id FROM users WHERE role = 'auditor' AND is_active = 1")
    .all();

  const stmt = db.prepare(
    `INSERT INTO notifications (user_id, organization_id, org_id, kind, type, title, message, is_read, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP)`,
  );

  for (const auditor of auditors) {
    stmt.run(auditor.id, auditor.organization_id, auditor.organization_id, kind, type, title, message);
  }
}

export function sendNotificationToUser({ userId, title, message, type = "recall", kind = "recall" }) {
  const db = getDb();
  const user = db.prepare("SELECT id, organization_id FROM users WHERE id = ?").get(userId);
  if (!user) return;

  db.prepare(
    `INSERT INTO notifications (user_id, organization_id, org_id, kind, type, title, message, is_read, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP)`,
  ).run(user.id, user.organization_id, user.organization_id, kind, type, title, message);
}

export function sendRecallNotificationsToOrg({ orgId, title, message, recallId: _recallId }) {
  sendNotificationToOrg({
    orgId,
    title,
    message,
    type: "RECALL_ALERT",
    kind: "recall",
  });
}

export function listUserNotifications(userId, limit = 50) {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, user_id, organization_id, org_id, kind, type, title, message,
              is_read, read_at, created_at
       FROM notifications
       WHERE user_id = ?
       ORDER BY id DESC
       LIMIT ?`,
    )
    .all(Number(userId), Number(limit));

  const unreadCount = db
    .prepare(
      "SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND (is_read = 0 OR read_at IS NULL)",
    )
    .get(Number(userId))?.count || 0;

  return {
    notifications: rows.map((r) => ({
      ...r,
      is_read: Boolean(r.is_read || r.read_at),
    })),
    unreadCount,
  };
}

export function markNotificationRead(notificationId, userId) {
  const db = getDb();
  db.prepare(
    `UPDATE notifications
     SET is_read = 1, read_at = CURRENT_TIMESTAMP
     WHERE id = ? AND user_id = ?`,
  ).run(Number(notificationId), Number(userId));

  return listUserNotifications(userId);
}

export function markAllNotificationsRead(userId) {
  const db = getDb();
  db.prepare(
    `UPDATE notifications
     SET is_read = 1, read_at = CURRENT_TIMESTAMP
     WHERE user_id = ? AND (is_read = 0 OR read_at IS NULL)`,
  ).run(Number(userId));

  return listUserNotifications(userId);
}
