/**
 * SCRUM Sprint 8: Inspector Service
 * Sub-task T-124: Inspector Inspection API
 * Cho phép cán bộ kiểm tra (INSPECTOR / auditor) tra cứu toàn diện hồ sơ lô hàng liên tổ chức.
 */
import { getDb } from "../db/database.js";
import { verifyHashChainProof } from "./sprint7PublicService.js";

/**
 * Tra cứu toàn diện hồ sơ lô hàng xuyên tổ chức
 * @param {string|number} identifier - Mã lô (batch_code), mã công khai (public_code) hoặc ID
 */
export function getInspectorTrace(identifier) {
  const db = getDb();

  const batch = db
    .prepare(
      `SELECT b.id, b.batch_code, b.public_code, b.product_id, b.organization_id,
              b.initial_quantity, b.remaining_quantity, b.consumed_quantity,
              b.current_location, b.temperature_c, b.cold_chain_alert, b.status,
              b.created_at, b.updated_at, b.harvested_at,
              p.name AS product_name, p.unit, p.min_temp, p.max_temp, p.max_allowed_delay_minutes,
              org.name AS owner_organization_name, org.type AS owner_organization_type, org.address AS owner_organization_address,
              farm.id AS farm_id, farm.name AS farm_name, farm.address AS farm_address,
              farm.is_anonymized AS farm_is_anonymized, farm.pseudonym AS farm_pseudonym,
              lp.name AS plot_name, lp.area_ha, lp.soil_type, lp.certification_code,
              cert.name AS cert_name, cert.standard AS cert_standard, cert.issuer AS cert_issuer
       FROM batches b
       JOIN products p ON p.id = b.product_id
       JOIN organizations org ON org.id = b.organization_id
       LEFT JOIN farms farm ON farm.id = b.source_farm_id
       LEFT JOIN land_plots lp ON lp.id = b.land_plot_id
       LEFT JOIN certifications cert ON cert.code = lp.certification_code
       WHERE b.batch_code = ? OR b.public_code = ? OR b.id = ?`,
    )
    .get(identifier, identifier, Number(identifier) || -1);

  if (!batch) {
    const error = new Error(`Không tìm thấy hồ sơ thanh tra cho mã lô '${identifier}'.`);
    error.statusCode = 404;
    throw error;
  }

  // 1. Danh sách tất cả tổ chức liên quan trong hành trình chuyển giao (Cross-organization)
  const transfers = db
    .prepare(
      `SELECT bt.id, bt.batch_id, bt.status, bt.note, bt.reason, bt.created_at, bt.updated_at,
              from_org.id AS from_org_id, from_org.name AS from_org_name, from_org.type AS from_org_type,
              to_org.id AS to_org_id, to_org.name AS to_org_name, to_org.type AS to_org_type,
              trp.id AS transporter_id, trp.code AS transporter_code, trp.name AS transporter_name, trp.license_plate
       FROM batch_transfers bt
       JOIN organizations from_org ON from_org.id = bt.from_organization_id
       JOIN organizations to_org ON to_org.id = bt.to_organization_id
       LEFT JOIN transporters trp ON trp.id = bt.transporter_id
       WHERE bt.batch_id = ?
       ORDER BY bt.created_at ASC`,
    )
    .all(batch.id);

  // Tập hợp danh sách các tổ chức độc nhất liên quan đến lô hàng
  const orgMap = new Map();
  orgMap.set(batch.organization_id, {
    id: batch.organization_id,
    name: batch.owner_organization_name,
    type: batch.owner_organization_type,
    address: batch.owner_organization_address,
    role: "Đơn vị đang sở hữu / Lưu kho",
  });

  for (const t of transfers) {
    if (!orgMap.has(t.from_org_id)) {
      orgMap.set(t.from_org_id, {
        id: t.from_org_id,
        name: t.from_org_name,
        type: t.from_org_type,
        role: "Bên chuyển giao",
      });
    }
    if (!orgMap.has(t.to_org_id)) {
      orgMap.set(t.to_org_id, {
        id: t.to_org_id,
        name: t.to_org_name,
        type: t.to_org_type,
        role: "Bên tiếp nhận",
      });
    }
  }

  // 2. Toàn bộ nhật ký sự kiện mã hóa (Event Logs) kèm thông tin định danh & ẩn danh NĐ 13
  const eventRows = db
    .prepare(
      `SELECT e.id, e.batch_id, e.event_type, e.actor_id, e.data_json, e.previous_hash, e.current_hash, e.timestamp,
              u.name AS actor_name, u.role AS actor_role, u.is_anonymized AS actor_is_anonymized, u.pseudonym AS actor_pseudonym
       FROM event_logs e
       LEFT JOIN users u ON u.id = e.actor_id
       WHERE e.batch_id = ?
       ORDER BY e.id ASC`,
    )
    .all(batch.id);

  const formattedEvents = eventRows.map((e, idx) => {
    let parsedData = {};
    try {
      parsedData = JSON.parse(e.data_json || "{}");
    } catch {
      parsedData = { raw: e.data_json };
    }

    // Xử lý hiển thị tên người thực hiện theo Nghị định 13/2023 (nếu đã ẩn danh)
    let displayName = e.actor_name || "Hệ thống tự động";
    if (e.actor_is_anonymized && e.actor_pseudonym) {
      displayName = e.actor_pseudonym;
    }

    return {
      blockIndex: idx + 1,
      id: e.id,
      eventType: e.event_type,
      actor: displayName,
      actorRole: e.actor_role || "system",
      isActorAnonymized: Boolean(e.actor_is_anonymized),
      timestamp: e.timestamp,
      previousHash: e.previous_hash,
      currentHash: e.current_hash,
      data: parsedData,
    };
  });

  // 3. Giám sát chuỗi lạnh & vi phạm nhiệt độ
  const tempStats = db
    .prepare(
      `SELECT COUNT(*) AS total_readings,
              ROUND(AVG(temperature), 2) AS avg_temperature,
              ROUND(MIN(temperature), 2) AS min_temperature,
              ROUND(MAX(temperature), 2) AS max_temperature
       FROM temperature_logs
       WHERE batch_id = ?`,
    )
    .get(batch.id);

  const alerts = db
    .prepare(
      `SELECT id, alert_type, message, started_at, detected_at, resolved_at
       FROM cold_chain_alerts
       WHERE batch_id = ?
       ORDER BY started_at ASC`,
    )
    .all(batch.id);

  // 4. Xác minh toán học tính toàn vẹn Hash Chain
  const hashProof = verifyHashChainProof(batch.public_code || batch.batch_code);

  // 5. Cây phả hệ lô hàng (Genealogy - kết hợp cả batch_lineage và batch_relations)
  const lineageParents = db
    .prepare(
      `SELECT r.parent_batch_id, r.quantity_transferred, b2.batch_code, p2.name AS product_name
       FROM (
         SELECT parent_batch_id, child_batch_id, quantity_transferred FROM batch_lineage
         UNION
         SELECT parent_batch_id, child_batch_id, quantity AS quantity_transferred FROM batch_relations
       ) r
       JOIN batches b2 ON b2.id = r.parent_batch_id
       JOIN products p2 ON p2.id = b2.product_id
       WHERE r.child_batch_id = ?`,
    )
    .all(batch.id);

  const lineageChildren = db
    .prepare(
      `SELECT r.child_batch_id, r.quantity_transferred, b2.batch_code, p2.name AS product_name
       FROM (
         SELECT parent_batch_id, child_batch_id, quantity_transferred FROM batch_lineage
         UNION
         SELECT parent_batch_id, child_batch_id, quantity AS quantity_transferred FROM batch_relations
       ) r
       JOIN batches b2 ON b2.id = r.child_batch_id
       JOIN products p2 ON p2.id = b2.product_id
       WHERE r.parent_batch_id = ?`,
    )
    .all(batch.id);

  // 6. Xử lý thông tin nông hộ tuân thủ NĐ 13/2023/NĐ-CP
  let farmDisplayName = batch.farm_name;
  let farmDisplayAddress = batch.farm_address;
  if (batch.farm_is_anonymized && batch.farm_pseudonym) {
    farmDisplayName = batch.farm_pseudonym;
    // Giữ tỉnh/thành nhưng che thôn/xã
    const parts = (batch.farm_address || "").split(",");
    farmDisplayAddress = parts.length > 1 ? `[Bảo vệ NĐ13], ${parts[parts.length - 1].trim()}` : "[Đã ẩn danh theo NĐ 13/2023]";
  }

  return {
    dossierCode: `DOSSIER-${batch.batch_code}-${new Date().getFullYear()}`,
    batch: {
      id: batch.id,
      batchCode: batch.batch_code,
      publicCode: batch.public_code,
      productName: batch.product_name,
      unit: batch.unit,
      initialQuantity: batch.initial_quantity,
      remainingQuantity: batch.remaining_quantity,
      consumedQuantity: batch.consumed_quantity,
      currentLocation: batch.current_location,
      status: batch.status,
      createdAt: batch.created_at,
      harvestedAt: batch.harvested_at,
      temperatureC: batch.temperature_c,
      coldChainAlert: Boolean(batch.cold_chain_alert),
    },
    origin: {
      farmId: batch.farm_id,
      farmName: farmDisplayName,
      farmAddress: farmDisplayAddress,
      isAnonymized: Boolean(batch.farm_is_anonymized),
      plotName: batch.plot_name,
      areaHa: batch.area_ha,
      soilType: batch.soil_type,
      certificationCode: batch.certification_code,
      certificationName: batch.cert_name,
      certificationStandard: batch.cert_standard,
      certificationIssuer: batch.cert_issuer,
    },
    organizationsInvolved: Array.from(orgMap.values()),
    transfers,
    genealogy: {
      parents: lineageParents,
      children: lineageChildren,
    },
    coldChain: {
      thresholds: {
        minTemp: batch.min_temp,
        maxTemp: batch.max_temp,
        maxAllowedDelayMinutes: batch.max_allowed_delay_minutes,
      },
      stats: {
        totalReadings: tempStats?.total_readings || 0,
        avgTemperature: tempStats?.avg_temperature || 0,
        minTemperature: tempStats?.min_temperature || 0,
        maxTemperature: tempStats?.max_temperature || 0,
      },
      alertCount: alerts.length,
      alerts,
    },
    hashChain: {
      isChainValid: hashProof.verified,
      blockCount: hashProof.blockCount,
      genesisHash: hashProof.genesisHash,
      headHash: hashProof.headHash,
      verificationStatus: hashProof.status,
      checkedAt: hashProof.checkedAt,
      events: formattedEvents,
    },
    inspectorMeta: {
      inspectedAt: new Date().toISOString(),
      regulationCompliance: "Tuân thủ Nghị định 13/2023/NĐ-CP & Tiêu chuẩn Quốc gia TCVN ISO 22005",
      isPiiProtected: Boolean(batch.farm_is_anonymized),
    },
  };
}
