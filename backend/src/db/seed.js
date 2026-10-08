import bcrypt from "bcryptjs";
import { getDb } from "./database.js";
import { sha256 } from "../utils/hash.js";
import { createEventLog } from "../services/batchService.js";

// Demo-only accounts use fixed Argon2id hashes so seeding remains synchronous
// while production-created passwords are always hashed through authService.
const demoPasswordHashes = {
  "Farm@123": "$argon2id$v=19$m=65536,p=4,t=3$RAlgkak3SlB9TP0vpcSCZw$qVdC6ve+kcyt1TG7ASIDFRbjfOXQeIlueXuzo2BgqMI",
  "Processor@123": "$argon2id$v=19$m=65536,p=4,t=3$8l1Wt5Ej1Sy3lyq1kMi1FQ$Hre/mU02arAPXQfLdZNjXZ18czP7Q6nAmYjZRODIPUM",
  "Distributor@123": "$argon2id$v=19$m=65536,p=4,t=3$cACCoS4hqFrFwQRvD9VtfQ$rdtTexZPlyxsUHbErql72bq3Rs8QXN2ASz3fvfwDaKk",
  "Auditor@123": "$argon2id$v=19$m=65536,p=4,t=3$oAFvT3XFLCBgXq9QxkeGJw$diU1H93BU4CYGMc369UuYcIOt0E34cpiVdjlsTxtKn8",
  "Consumer@123": "$argon2id$v=19$m=65536,p=4,t=3$PQzhu2ZODU0fkiemFpPwsg$FcsDvw3CfspQEis8hUhRZrVK18sRwGt/jZ/5oKD+Y2s",
  "User@123": "$argon2id$v=19$m=65536,p=4,t=3$dSunGimagfcTR3FFOuQjLw$i/2k8eP5LpZzYvogN/rlCdfprmrAPuMY33j8ujRU3Uc",
};

const passwordHash = (password) =>
  demoPasswordHashes[password] || bcrypt.hashSync(password, 12);

export function ensureDemoFarmerAccount() {
  const db = getDb();
  const existingUser = db
    .prepare("SELECT id FROM users WHERE email = ?")
    .get("user@agritrace.demo");

  if (existingUser) return;

  const farmOrganization = db
    .prepare(
      "SELECT id FROM organizations WHERE type = 'farm' ORDER BY id LIMIT 1",
    )
    .get();

  if (!farmOrganization) return;

  db.prepare(
    `INSERT INTO users(organization_id, name, email, password_hash, role)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(
    farmOrganization.id,
    "Farmer Demo",
    "user@agritrace.demo",
    passwordHash("User@123"),
    "user",
  );
}

export function seedDemoData() {
  const db = getDb();

  try {
    db.exec("BEGIN IMMEDIATE");

    const organizationRows = [
      { name: "Farm Tây Nguyên", type: "farm", address: "Đắk Lắk" },
      { name: "HTX Sơ chế Hà Nội", type: "processor", address: "Hà Nội" },
      {
        name: "Cửa hàng Organic Market",
        type: "distributor",
        address: "Hà Nội",
      },
    ];

    const organizationIds = {};
    for (const organization of organizationRows) {
      const row = db
        .prepare(
          "INSERT INTO organizations(name, type, address) VALUES (?, ?, ?)",
        )
        .run(organization.name, organization.type, organization.address);
      organizationIds[organization.type] = row.lastInsertRowid;
    }

    const users = [
      {
        organization_id: organizationIds.farm,
        name: "Quản trị Farm",
        email: "farm@agritrace.demo",
        password: "Farm@123",
        role: "farm_admin",
      },
      {
        organization_id: organizationIds.processor,
        name: "Quản trị HTX",
        email: "processor@agritrace.demo",
        password: "Processor@123",
        role: "processor_admin",
      },
      {
        organization_id: organizationIds.distributor,
        name: "Quản trị Cửa hàng",
        email: "distributor@agritrace.demo",
        password: "Distributor@123",
        role: "distributor_admin",
      },
      {
        organization_id: 1,
        name: "Cán bộ kiểm tra",
        email: "auditor@agritrace.demo",
        password: "Auditor@123",
        role: "auditor",
      },
      {
        organization_id: organizationIds.farm,
        name: "Người tiêu dùng",
        email: "consumer@agritrace.demo",
        password: "Consumer@123",
        role: "consumer",
      },
      {
        organization_id: organizationIds.farm,
        name: "Người dùng cơ bản",
        email: "user@agritrace.demo",
        password: "User@123",
        role: "user",
      },
    ];

    for (const user of users) {
      db.prepare(
        `INSERT INTO users(organization_id, name, email, password_hash, role, is_active, failed_login_count, locked_until)
         VALUES (?, ?, ?, ?, ?, 1, 0, NULL)`,
      ).run(
        user.organization_id,
        user.name,
        user.email,
        passwordHash(user.password),
        user.role,
      );
    }

    const farmId = db
      .prepare(
        "INSERT INTO farms(organization_id, name, address, latitude, longitude) VALUES (?, ?, ?, ?, ?)",
      )
      .run(
        organizationIds.farm,
        "Vùng trồng Tây Nguyên",
        "Đắk Lắk",
        12.7,
        108.1,
      ).lastInsertRowid;

    db.prepare(
      "INSERT INTO land_plots(farm_id, name, area_ha, latitude, longitude) VALUES (?, ?, ?, ?, ?)",
    ).run(farmId, "Thửa A1", 8.5, 12.71, 108.12);
    db.prepare(
      "INSERT INTO land_plots(farm_id, name, area_ha, latitude, longitude) VALUES (?, ?, ?, ?, ?)",
    ).run(farmId, "Thửa A2", 6.2, 12.73, 108.09);

    const productId = db
      .prepare(
        "INSERT INTO products(organization_id, name, unit) VALUES (?, ?, ?)",
      )
      .run(organizationIds.farm, "Dưa hấu đỏ", "kg");

    const batch = db
      .prepare(
        `INSERT INTO batches(batch_code, product_id, organization_id, source_farm_id, initial_quantity, remaining_quantity, current_location, temperature_c, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        "BATCH-THA-2026-0001",
        productId.lastInsertRowid,
        organizationIds.farm,
        farmId,
        500,
        420,
        "Vùng trồng Tây Nguyên",
        9,
        "registered",
      );

    const createdAt = new Date().toISOString();
    const genesisHash = sha256(
      `GENESIS_HASH${batch.lastInsertRowid}batch_registered${JSON.stringify({
        batch_code: "BATCH-THA-2026-0001",
        product: "Dưa hấu đỏ",
        initial_quantity: 500,
        source_farm: "Vùng trồng Tây Nguyên",
        owner: "Farm Tây Nguyên",
      })}${createdAt}`,
    );
    db.prepare(
      `INSERT INTO event_logs(batch_id, event_type, actor_id, data_json, previous_hash, current_hash, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      batch.lastInsertRowid,
      "batch_registered",
      1,
      JSON.stringify({
        batch_code: "BATCH-THA-2026-0001",
        product: "Dưa hấu đỏ",
        initial_quantity: 500,
        source_farm: "Vùng trồng Tây Nguyên",
        owner: "Farm Tây Nguyên",
      }),
      "GENESIS_HASH",
      genesisHash,
      createdAt,
    );

    const rootBatchId = Number(batch.lastInsertRowid);
    const farmAdminId = db
      .prepare("SELECT id FROM users WHERE email = ?")
      .get("farm@agritrace.demo").id;
    const processorAdminId = db
      .prepare("SELECT id FROM users WHERE email = ?")
      .get("processor@agritrace.demo").id;
    const distributorAdminId = db
      .prepare("SELECT id FROM users WHERE email = ?")
      .get("distributor@agritrace.demo").id;
    const setBatch = db.prepare(
      "UPDATE batches SET remaining_quantity = ?, consumed_quantity = ?, status = ? WHERE id = ?",
    );
    setBatch.run(0, 0, "processed", rootBatchId);
    createEventLog({
      batchId: rootBatchId,
      eventType: "batch_harvested",
      actorId: farmAdminId,
      data: {
        product_name: "Dưa hấu đỏ",
        land_plot_name: "Thửa A1",
        quantity_kg: 500,
        harvested_at: createdAt,
      },
      timestamp: createdAt,
    });

    const insertDerivedBatch = ({
      code,
      organizationId,
      parentId = null,
      sourceIds,
      initialQuantity,
      remainingQuantity,
      consumedQuantity = 0,
      status,
      location,
      actorId,
      eventType,
    }) => {
      const result = db
        .prepare(
          `INSERT INTO batches(
          batch_code, product_id, organization_id, source_farm_id,
          parent_batch_id, root_batch_id, source_batch_ids,
          initial_quantity, remaining_quantity, consumed_quantity,
          current_location, temperature_c, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 4.5, ?)`,
        )
        .run(
          code,
          productId.lastInsertRowid,
          organizationId,
          farmId,
          parentId,
          rootBatchId,
          JSON.stringify(sourceIds),
          initialQuantity,
          remainingQuantity,
          consumedQuantity,
          location,
          status,
        );
      const id = Number(result.lastInsertRowid);
      createEventLog({
        batchId: id,
        eventType,
        actorId,
        data: {
          source_batch_ids: sourceIds,
          initial_quantity: initialQuantity,
          remaining_quantity: remainingQuantity,
          location,
        },
      });
      return id;
    };

    const firstTierSpecs = [
      { code: "BATCH-THA-2026-0001-A", quantity: 150 },
      { code: "BATCH-THA-2026-0001-B", quantity: 150 },
      { code: "BATCH-THA-2026-0001-C", quantity: 200 },
    ];
    const firstTier = firstTierSpecs.map((entry) =>
      insertDerivedBatch({
        code: entry.code,
        organizationId: organizationIds.processor,
        parentId: rootBatchId,
        sourceIds: [rootBatchId],
        initialQuantity: entry.quantity,
        remainingQuantity: 0,
        status: "processed",
        location: "HTX Sơ chế Hà Nội",
        actorId: processorAdminId,
        eventType: "batch_split_child",
      }),
    );

    const secondTierSpecs = [
      { sourceIds: firstTier.slice(0, 2), quantity: 100, owner: "processor" },
      { sourceIds: firstTier.slice(0, 2), quantity: 100, owner: "distributor" },
      { sourceIds: firstTier.slice(1), quantity: 150, owner: "processor" },
      { sourceIds: [firstTier[2]], quantity: 150, owner: "distributor" },
    ];
    const secondTier = secondTierSpecs.map((entry, index) =>
      insertDerivedBatch({
        code: `BATCH-THA-2026-0001-M${index + 1}`,
        organizationId: organizationIds[entry.owner],
        sourceIds: entry.sourceIds,
        initialQuantity: entry.quantity,
        remainingQuantity: 0,
        status: "processed",
        location:
          entry.owner === "processor"
            ? "Kho HTX Hà Nội"
            : "Kho phân phối Hà Nội",
        actorId:
          entry.owner === "processor" ? processorAdminId : distributorAdminId,
        eventType: "batch_merged",
      }),
    );

    const leafSpecs = [
      {
        quantity: 120,
        remaining: 100,
        owner: "distributor",
        location: "Cửa hàng Organic Market",
      },
      {
        quantity: 130,
        remaining: 110,
        owner: "distributor",
        location: "Kho bán lẻ Hà Nội",
      },
      {
        quantity: 100,
        remaining: 80,
        owner: "processor",
        location: "Kho lạnh HTX",
      },
      {
        quantity: 150,
        remaining: 130,
        owner: "distributor",
        location: "Cửa hàng Organic Market",
      },
    ];
    const leaves = leafSpecs.map((entry, index) =>
      insertDerivedBatch({
        code: `BATCH-THA-2026-0001-F${index + 1}`,
        organizationId: organizationIds[entry.owner],
        parentId: secondTier[index],
        sourceIds: [secondTier[index]],
        initialQuantity: entry.quantity,
        remainingQuantity: entry.remaining,
        consumedQuantity: entry.quantity - entry.remaining,
        status: index === 0 ? "delivered" : "in_transit",
        location: entry.location,
        actorId:
          entry.owner === "processor" ? processorAdminId : distributorAdminId,
        eventType: "batch_split_child",
      }),
    );

    for (let index = 0; index < leaves.length; index += 1) {
      const eventType = index === 0 ? "batch_delivered" : "batch_transferred";
      createEventLog({
        batchId: leaves[index],
        eventType,
        actorId: index === 2 ? processorAdminId : distributorAdminId,
        data: {
          occurred_at: new Date(
            Date.now() - (4 - index) * 60 * 60 * 1000,
          ).toISOString(),
        },
      });
    }

    const insertTemperature = db.prepare(
      "INSERT INTO temperature_logs(batch_id, temperature, source, timestamp) VALUES (?, ?, 'seed_sensor', ?)",
    );
    for (const [batchIndex, batchId] of leaves.entries()) {
      for (let readingIndex = 0; readingIndex < 6; readingIndex += 1) {
        insertTemperature.run(
          batchId,
          3.5 + ((batchIndex + readingIndex) % 5) * 0.4,
          new Date(
            Date.now() - (6 - readingIndex) * 10 * 60 * 1000,
          ).toISOString(),
        );
      }
    }

    db.exec("COMMIT");
    return true;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
