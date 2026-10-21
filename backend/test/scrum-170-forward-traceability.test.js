import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";
import { getDb } from "../src/db/database.js";
import { createToken, findUserByEmail } from "../src/services/authService.js";

let server;
let baseUrl;
const db = getDb();

test.before(async () => {
  const count = db.prepare("SELECT COUNT(*) AS c FROM users").get()?.c || 0;
  if (count === 0) {
    const { seedDemoData } = await import("../src/db/seed.js");
    seedDemoData();
  }
  server = createApp().listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

test.after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
});

// Setup 4-tier tree across 3 organizations with split and merge
function setupFourTierDescendantScenario() {
  const farmOrg = db.prepare("SELECT * FROM organizations WHERE type = 'farm' LIMIT 1").get();
  const processorOrg = db.prepare("SELECT * FROM organizations WHERE type = 'processor' LIMIT 1").get();
  const distributorOrg = db.prepare("SELECT * FROM organizations WHERE type = 'distributor' LIMIT 1").get();
  const product = db.prepare("SELECT id FROM products WHERE organization_id = ? LIMIT 1").get(farmOrg.id);
  const farm = db.prepare("SELECT id FROM farms WHERE organization_id = ? LIMIT 1").get(farmOrg.id);

  const timestamp = Date.now();

  // Helper to insert batch
  function insertBatch({ orgId, code, parentId = null, sourceBatchIds = [], status = "registered", qty = 100 }) {
    const res = db
      .prepare(
        `INSERT INTO batches (
          organization_id, product_id, source_farm_id, parent_batch_id, source_batch_ids,
          batch_code, initial_quantity, remaining_quantity, consumed_quantity, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      )
      .run(orgId, product.id, farm.id, parentId, JSON.stringify(sourceBatchIds), code, qty, qty, status);
    return res.lastInsertRowid;
  }

  // Helper to record relation
  function recordRelation(parentId, childId, type = "split", qty = 50) {
    db.prepare(
      "INSERT OR REPLACE INTO batch_relations (parent_batch_id, child_batch_id, relation_type, quantity) VALUES (?, ?, ?, ?)",
    ).run(parentId, childId, type, qty);
    db.prepare(
      "INSERT INTO batch_lineage (parent_batch_id, child_batch_id, quantity_transferred) VALUES (?, ?, ?)",
    ).run(parentId, childId, qty);
  }

  // 0. Root Batch at Farm
  const rootId = insertBatch({
    orgId: farmOrg.id,
    code: `BATCH-ROOT-S170-${timestamp}`,
    status: "recalling",
    qty: 1000,
  });

  // Independent Batch at Farm (for merge in Tier 3)
  const otherFarmBatchId = insertBatch({
    orgId: farmOrg.id,
    code: `BATCH-OTHER-FARM-${timestamp}`,
    status: "registered",
    qty: 300,
  });

  // TIER 1 (depth_level: 1)
  // T1_A: at Farm
  const t1AId = insertBatch({
    orgId: farmOrg.id,
    code: `BATCH-T1-A-${timestamp}`,
    parentId: rootId,
    sourceBatchIds: [rootId],
    status: "registered",
    qty: 300,
  });
  recordRelation(rootId, t1AId, "split", 300);

  // T1_B: at Processor Org
  const t1BId = insertBatch({
    orgId: processorOrg.id,
    code: `BATCH-T1-B-${timestamp}`,
    parentId: rootId,
    sourceBatchIds: [rootId],
    status: "processed",
    qty: 700,
  });
  recordRelation(rootId, t1BId, "split", 700);

  // TIER 2 (depth_level: 2)
  // T2_A: at Processor Org
  const t2AId = insertBatch({
    orgId: processorOrg.id,
    code: `BATCH-T2-A-${timestamp}`,
    parentId: t1BId,
    sourceBatchIds: [t1BId],
    status: "processed",
    qty: 350,
  });
  recordRelation(t1BId, t2AId, "split", 350);

  // T2_B: at Processor Org
  const t2BId = insertBatch({
    orgId: processorOrg.id,
    code: `BATCH-T2-B-${timestamp}`,
    parentId: t1BId,
    sourceBatchIds: [t1BId],
    status: "processed",
    qty: 350,
  });
  recordRelation(t1BId, t2BId, "split", 350);

  // TIER 3 (depth_level: 3) - MERGE of T2_A and otherFarmBatchId at Distributor Org
  const t3MergeId = insertBatch({
    orgId: distributorOrg.id,
    code: `BATCH-T3-MERGE-${timestamp}`,
    parentId: null,
    sourceBatchIds: [t2AId, otherFarmBatchId],
    status: "delivered",
    qty: 500,
  });
  recordRelation(t2AId, t3MergeId, "merge", 300);
  recordRelation(otherFarmBatchId, t3MergeId, "merge", 200);

  // TIER 4 (depth_level: 4) - SPLIT of T3_MERGE at Distributor Org
  const t4SplitId = insertBatch({
    orgId: distributorOrg.id,
    code: `BATCH-T4-SPLIT-${timestamp}`,
    parentId: t3MergeId,
    sourceBatchIds: [t3MergeId],
    status: "delivered",
    qty: 250,
  });
  recordRelation(t3MergeId, t4SplitId, "split", 250);

  // Create recall order for the root batch
  const insertRecall = db
    .prepare("INSERT INTO recall_orders (batch_id, reason, status, created_by) VALUES (?, ?, 'opened', 1)")
    .run(rootId, "Sự cố kiểm nghiệm dư lượng - SCRUM-170");
  const recallId = insertRecall.lastInsertRowid;

  return {
    rootId,
    recallId,
    otherFarmBatchId,
    distributorOrgId: distributorOrg.id,
    farmOrgName: farmOrg.name,
    processorOrgName: processorOrg.name,
    distributorOrgName: distributorOrg.name,
    t1AId,
    t1BId,
    t2AId,
    t2BId,
    t3MergeId,
    t4SplitId,
    insertBatch,
    recordRelation,
    timestamp,
  };
}

test("SCRUM-170: 401 Unauthorized when missing token", async () => {
  const res = await fetch(`${baseUrl}/api/v1/recalls/1/descendant-lots`);
  assert.equal(res.status, 401);
});

test("SCRUM-170: 403 Forbidden for non-auditor/non-admin roles (farm, processor, distributor, user, consumer)", async () => {
  const farmAdmin = findUserByEmail("farm@agritrace.demo");
  const processorAdmin = findUserByEmail("processor@agritrace.demo");
  const distributorAdmin = findUserByEmail("distributor@agritrace.demo");
  const basicUser = findUserByEmail("user@agritrace.demo");
  const consumer = findUserByEmail("consumer@agritrace.demo");

  const restrictedUsers = [farmAdmin, processorAdmin, distributorAdmin, basicUser, consumer];

  for (const u of restrictedUsers) {
    assert.ok(u, "User should exist");
    const token = createToken(u);
    const res = await fetch(`${baseUrl}/api/v1/recalls/1/descendant-lots`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 403, `Role ${u.role} must receive 403 Forbidden`);
    const data = await res.json();
    assert.equal(data.message, "Bạn không có quyền thực hiện thao tác này.");
  }
});

test("SCRUM-170: 404 Not Found when recall_id does not exist", async () => {
  const auditor = findUserByEmail("auditor@agritrace.demo");
  const token = createToken(auditor);

  const res = await fetch(`${baseUrl}/api/v1/recalls/9999999/descendant-lots`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(res.status, 404);
  const data = await res.json();
  assert.equal(data.message, "Không tìm thấy lệnh thu hồi.");
});

test("SCRUM-170: 200 OK - Forward Traceability traverses all 4 tiers across 3 organizations, detecting merged lots", async () => {
  const auditor = findUserByEmail("auditor@agritrace.demo");
  const token = createToken(auditor);

  const scenario = setupFourTierDescendantScenario();

  // Call GET /api/v1/recalls/:recall_id/descendant-lots
  const res = await fetch(`${baseUrl}/api/v1/recalls/${scenario.recallId}/descendant-lots`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(res.status, 200);
  const data = await res.json();

  // 1. Root structure verification
  assert.equal(data.root_batch_id, scenario.rootId);
  assert.equal(data.total_descendants, 6);
  assert.ok(Array.isArray(data.descendants));
  assert.equal(data.descendants.length, 6);

  // 2. Tier 1 Verification (depth_level: 1)
  const itemT1A = data.descendants.find((d) => d.batch_id === scenario.t1AId);
  assert.ok(itemT1A, "T1_A must exist in descendants");
  assert.equal(itemT1A.depth_level, 1);
  assert.equal(itemT1A.is_merged, false);
  assert.equal(itemT1A.organization_name, scenario.farmOrgName);

  const itemT1B = data.descendants.find((d) => d.batch_id === scenario.t1BId);
  assert.ok(itemT1B, "T1_B must exist in descendants");
  assert.equal(itemT1B.depth_level, 1);
  assert.equal(itemT1B.is_merged, false);
  assert.equal(itemT1B.organization_name, scenario.processorOrgName);

  // 3. Tier 2 Verification (depth_level: 2)
  const itemT2A = data.descendants.find((d) => d.batch_id === scenario.t2AId);
  assert.ok(itemT2A, "T2_A must exist in descendants");
  assert.equal(itemT2A.depth_level, 2);
  assert.equal(itemT2A.is_merged, false);
  assert.equal(itemT2A.organization_name, scenario.processorOrgName);

  const itemT2B = data.descendants.find((d) => d.batch_id === scenario.t2BId);
  assert.ok(itemT2B, "T2_B must exist in descendants");
  assert.equal(itemT2B.depth_level, 2);
  assert.equal(itemT2B.is_merged, false);

  // 4. Tier 3 Verification (depth_level: 3) - MERGED LOT
  const itemT3Merge = data.descendants.find((d) => d.batch_id === scenario.t3MergeId);
  assert.ok(itemT3Merge, "T3_MERGE must exist in descendants");
  assert.equal(itemT3Merge.depth_level, 3);
  assert.equal(itemT3Merge.is_merged, true);
  assert.ok(Array.isArray(itemT3Merge.merged_source_batch_ids));
  assert.ok(itemT3Merge.merged_source_batch_ids.includes(scenario.t2AId));
  assert.ok(itemT3Merge.merged_source_batch_ids.includes(scenario.otherFarmBatchId));
  assert.equal(itemT3Merge.organization_name, scenario.distributorOrgName);
  assert.match(itemT3Merge.warning, /Lô gộp từ nhiều nguồn/);

  // 5. Tier 4 Verification (depth_level: 4) - SPLIT OF MERGE
  const itemT4Split = data.descendants.find((d) => d.batch_id === scenario.t4SplitId);
  assert.ok(itemT4Split, "T4_SPLIT must exist in descendants");
  assert.equal(itemT4Split.depth_level, 4);
  assert.equal(itemT4Split.organization_name, scenario.distributorOrgName);
});

test("SCRUM-170: Dynamic/Real-time updates - newly split descendant appears immediately without recreating recall", async () => {
  const auditor = findUserByEmail("auditor@agritrace.demo");
  const token = createToken(auditor);

  const scenario = setupFourTierDescendantScenario();

  // Initial call returns 6 descendants
  const resInitial = await fetch(`${baseUrl}/api/v1/recalls/${scenario.recallId}/descendant-lots`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const dataInitial = await resInitial.json();
  assert.equal(dataInitial.total_descendants, 6);

  // Dynamically split T4 into a new Tier 5 child
  const t5ChildId = scenario.insertBatch({
    orgId: scenario.distributorOrgId,
    code: `BATCH-T5-DYNAMIC-${Date.now()}`,
    parentId: scenario.t4SplitId,
    sourceBatchIds: [scenario.t4SplitId],
    status: "delivered",
    qty: 50,
  });
  scenario.recordRelation(scenario.t4SplitId, t5ChildId, "split", 50);

  // Calling API again immediately discovers the newly created descendant in real-time
  const resUpdated = await fetch(`${baseUrl}/api/v1/recalls/${scenario.recallId}/descendant-lots`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const dataUpdated = await resUpdated.json();
  assert.equal(dataUpdated.total_descendants, 7);

  const itemT5 = dataUpdated.descendants.find((d) => d.batch_id === t5ChildId);
  assert.ok(itemT5, "Dynamically created Tier 5 descendant must be returned");
  assert.equal(itemT5.depth_level, 5);
});

test("SCRUM-170: Direct batch endpoint GET /api/v1/batches/:id/trace-downstream works identically", async () => {
  const systemAdmin = findUserByEmail("admin@agritrace.demo");
  const token = createToken(systemAdmin);

  const scenario = setupFourTierDescendantScenario();

  const res = await fetch(`${baseUrl}/api/v1/batches/${scenario.rootId}/trace-downstream`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.root_batch_id, scenario.rootId);
  assert.equal(data.total_descendants, 6);
  assert.equal(data.descendants.length, 6);
});
