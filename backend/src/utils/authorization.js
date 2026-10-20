export const ROLE_HIERARCHY = {
  farm_admin: "farm",
  processor_admin: "processor",
  distributor_admin: "distributor",
  auditor: "auditor",
  inspector: "auditor",
  consumer: "consumer",
  user: "user",
};

export const ORGANIZATION_TYPES = {
  farm: ["farm_admin"],
  processor: ["processor_admin"],
  distributor: ["distributor_admin"],
  auditor: ["auditor", "inspector"],
  consumer: ["consumer"],
  user: ["user"],
};

export function isInspectorOrAuditor(user) {
  if (!user) return false;
  const role = String(user.role || "").toLowerCase();
  return role === "auditor" || role === "inspector";
}

export function requireOrganizationAccess(user, organizationId) {
  if (!user) return false;
  if (isInspectorOrAuditor(user)) return true;
  return user.organization_id === organizationId;
}

export function canManageBatch(user, batch) {
  if (!user) return false;
  if (isInspectorOrAuditor(user)) return true;
  return user.organization_id === batch.organization_id;
}

export function getRoleType(role) {
  return ROLE_HIERARCHY[role] || null;
}
