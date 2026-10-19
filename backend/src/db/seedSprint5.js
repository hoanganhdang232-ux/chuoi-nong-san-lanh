import { getDb } from "./database.js";
import { createEventLog } from "../services/batchService.js";

/**
 * SCRUM-175 / T-87: DB Seed Script cho Sprint 5.
 * Xây dựng cây phả hệ 15 lô hàng, 4 tầng sâu, bao gồm cả Split và Merge (Blended Batches).
 */
export function seedSprint5RecallDataset() {
  const db = getDb();

  // Kiểm tra nếu đã tồn tại root batch của Sprint 5 thì không seed lại
  const existing = db.prepare("SELECT id FROM batches WHERE batch_code = 'ROOT-SPRINT5-001'").get();
  if (existing) {
    return existing.id;
  }

  // Lấy các tổ chức mẫu: Farm (1), Processor (2), Distributor (3)
  const farmOrg = db.prepare("SELECT id FROM organizations WHERE type = 'farm' LIMIT 1").get() || { id: 1 };
  const procOrg = db.prepare("SELECT id FROM organizations WHERE type = 'processor' LIMIT 1").get() || { id: 2 };
  const distOrg = db.prepare("SELECT id FROM organizations WHERE type = 'distributor' LIMIT 1").get() || { id: 3 };

  // Lấy sản phẩm mẫu
  const product = db.prepare("SELECT id FROM products LIMIT 1").get() || { id: 1 };
  const adminUser = db.prepare("SELECT id FROM users WHERE role IN ('farm_admin', 'auditor') LIMIT 1").get() || { id: 1 };

  // Helper tạo batch
  function createBatch({ code, orgId, initialQty, remainingQty, consumedQty = 0, parentId = null, sourceBatchIds = "[]", location = "Kho tổng" }) {
    const res = db.prepare(`
      INSERT INTO batches (
        batch_code, product_id, organization_id, initial_quantity,
        remaining_quantity, consumed_quantity, current_location,
        parent_batch_id, source_batch_ids, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
      code,
      product.id,
      orgId,
      initialQty,
      remainingQty,
      consumedQty,
      location,
      parentId,
      sourceBatchIds,
    );
    const bId = Number(res.lastInsertRowid);

    createEventLog({
      batchId: bId,
      eventType: "batch_registered",
      actorId: adminUser.id,
      data: { initial_quantity: initialQty },
    });

    return bId;
  }

  // TẦNG 0: Lô gốc
  const rootId = createBatch({
    code: "ROOT-SPRINT5-001",
    orgId: farmOrg.id,
    initialQty: 1000,
    remainingQty: 0,
    location: "Vườn xoài Cần Thơ",
  });

  // TẦNG 1: Tách từ Lô gốc thành 2 lô con chuyển sang Nhà chế biến
  const b102 = createBatch({
    code: "BATCH-L1-A",
    orgId: procOrg.id,
    initialQty: 500,
    remainingQty: 0,
    parentId: rootId,
    location: "Xưởng sơ chế số 1",
  });
  const b103 = createBatch({
    code: "BATCH-L1-B",
    orgId: procOrg.id,
    initialQty: 500,
    remainingQty: 0,
    parentId: rootId,
    location: "Xưởng sơ chế số 2",
  });

  db.prepare("INSERT OR IGNORE INTO batch_relations (parent_batch_id, child_batch_id, relation_type, quantity) VALUES (?, ?, 'split', 500)").run(rootId, b102);
  db.prepare("INSERT OR IGNORE INTO batch_relations (parent_batch_id, child_batch_id, relation_type, quantity) VALUES (?, ?, 'split', 500)").run(rootId, b103);

  // TẦNG 2:
  // b102 tách thành 2 lô con
  const b104 = createBatch({
    code: "BATCH-L2-A1",
    orgId: procOrg.id,
    initialQty: 250,
    remainingQty: 0,
    parentId: b102,
    location: "Kho đóng gói chân không",
  });
  const b105 = createBatch({
    code: "BATCH-L2-A2",
    orgId: procOrg.id,
    initialQty: 250,
    remainingQty: 250,
    parentId: b102,
    location: "Kho lạnh bảo quản chế biến",
  });
  db.prepare("INSERT OR IGNORE INTO batch_relations (parent_batch_id, child_batch_id, relation_type, quantity) VALUES (?, ?, 'split', 250)").run(b102, b104);
  db.prepare("INSERT OR IGNORE INTO batch_relations (parent_batch_id, child_batch_id, relation_type, quantity) VALUES (?, ?, 'split', 250)").run(b102, b105);

  // Lô phụ độc lập để gộp
  const b106 = createBatch({
    code: "INDEPENDENT-BATCH-99",
    orgId: farmOrg.id,
    initialQty: 300,
    remainingQty: 0,
    location: "Nông trại Hậu Giang",
  });

  // b103 gộp với b106 thành Blended Batch
  const b107 = createBatch({
    code: "BATCH-L2-BLENDED",
    orgId: procOrg.id,
    initialQty: 800,
    remainingQty: 0,
    sourceBatchIds: JSON.stringify([b103, b106]),
    location: "Dây chuyền sấy dẻo kết hợp",
  });
  db.prepare("INSERT OR IGNORE INTO batch_relations (parent_batch_id, child_batch_id, relation_type, quantity) VALUES (?, ?, 'merge', 500)").run(b103, b107);
  db.prepare("INSERT OR IGNORE INTO batch_relations (parent_batch_id, child_batch_id, relation_type, quantity) VALUES (?, ?, 'merge', 300)").run(b106, b107);

  // TẦNG 3: Chuyển giao tới Nhà phân phối và chia về các cửa hàng
  const b108 = createBatch({
    code: "BATCH-L3-STORE1",
    orgId: distOrg.id,
    initialQty: 100,
    remainingQty: 40,
    consumedQty: 60,
    parentId: b104,
    location: "Cửa hàng Ba Đình, HN",
  });
  const b109 = createBatch({
    code: "BATCH-L3-STORE2",
    orgId: distOrg.id,
    initialQty: 150,
    remainingQty: 50,
    parentId: b104,
    location: "Cửa hàng Cầu Giấy, HN",
  });
  db.prepare("INSERT OR IGNORE INTO batch_relations (parent_batch_id, child_batch_id, relation_type, quantity) VALUES (?, ?, 'split', 100)").run(b104, b108);
  db.prepare("INSERT OR IGNORE INTO batch_relations (parent_batch_id, child_batch_id, relation_type, quantity) VALUES (?, ?, 'split', 150)").run(b104, b109);

  // b107 (Blended) tách làm 2
  const b110 = createBatch({
    code: "BATCH-L3-BLEND-SUB1",
    orgId: distOrg.id,
    initialQty: 400,
    remainingQty: 0,
    parentId: b107,
    location: "Kho trung chuyển miền Bắc",
  });
  const b111 = createBatch({
    code: "BATCH-L3-BLEND-SUB2",
    orgId: distOrg.id,
    initialQty: 400,
    remainingQty: 400,
    parentId: b107,
    location: "Kho trung tâm phân phối Hải Phòng",
  });
  db.prepare("INSERT OR IGNORE INTO batch_relations (parent_batch_id, child_batch_id, relation_type, quantity) VALUES (?, ?, 'split', 400)").run(b107, b110);
  db.prepare("INSERT OR IGNORE INTO batch_relations (parent_batch_id, child_batch_id, relation_type, quantity) VALUES (?, ?, 'split', 400)").run(b107, b111);

  // TẦNG 4:
  // b108 chia nhỏ
  const b112 = createBatch({
    code: "BATCH-L4-FINAL1",
    orgId: distOrg.id,
    initialQty: 20,
    remainingQty: 20,
    parentId: b108,
    location: "Điểm bán hàng tiện lợi Hoàn Kiếm",
  });
  db.prepare("INSERT OR IGNORE INTO batch_relations (parent_batch_id, child_batch_id, relation_type, quantity) VALUES (?, ?, 'split', 20)").run(b108, b112);

  // b110 (Blended) gộp với b109 thành Lô siêu pha trộn (Multi-blend)
  const b113 = createBatch({
    code: "BATCH-L4-MULTI-BLEND",
    orgId: distOrg.id,
    initialQty: 500,
    remainingQty: 350,
    consumedQty: 150,
    sourceBatchIds: JSON.stringify([b110, b109]),
    location: "Tổng kho đại siêu thị miền Bắc",
  });
  db.prepare("INSERT OR IGNORE INTO batch_relations (parent_batch_id, child_batch_id, relation_type, quantity) VALUES (?, ?, 'merge', 400)").run(b110, b113);
  db.prepare("INSERT OR IGNORE INTO batch_relations (parent_batch_id, child_batch_id, relation_type, quantity) VALUES (?, ?, 'merge', 100)").run(b109, b113);

  const b114 = createBatch({
    code: "BATCH-L4-FINAL2",
    orgId: distOrg.id,
    initialQty: 50,
    remainingQty: 50,
    parentId: b110,
    location: "Cửa hàng Đống Đa, HN",
  });
  db.prepare("INSERT OR IGNORE INTO batch_relations (parent_batch_id, child_batch_id, relation_type, quantity) VALUES (?, ?, 'split', 50)").run(b110, b114);

  const b115 = createBatch({
    code: "BATCH-L4-FINAL3",
    orgId: distOrg.id,
    initialQty: 100,
    remainingQty: 100,
    parentId: b111,
    location: "Cửa hàng Hạ Long, QN",
  });
  db.prepare("INSERT OR IGNORE INTO batch_relations (parent_batch_id, child_batch_id, relation_type, quantity) VALUES (?, ?, 'split', 100)").run(b111, b115);

  return rootId;
}
