import { getDb } from "./database.js";
import { runMigrations } from "./migrations.js";
import { createEventLog } from "../services/batchService.js";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function seedFeatureDemoData() {
  runMigrations();
  const db = getDb();
  const existingSample = db
    .prepare("SELECT id FROM batches WHERE batch_code = ?")
    .get("BATCH-TRACE-DEMO-2026-ROOT");
  if (existingSample) return { created: false, batchCount: 12 };

  const farm = db
    .prepare(
      "SELECT id FROM organizations WHERE type = 'farm' ORDER BY id LIMIT 1",
    )
    .get();
  const processor = db
    .prepare(
      "SELECT id FROM organizations WHERE type = 'processor' ORDER BY id LIMIT 1",
    )
    .get();
  const distributor = db
    .prepare(
      "SELECT id FROM organizations WHERE type = 'distributor' ORDER BY id LIMIT 1",
    )
    .get();
  const product =
    farm &&
    db
      .prepare(
        "SELECT id FROM products WHERE organization_id = ? ORDER BY id LIMIT 1",
      )
      .get(farm.id);
  const sourceFarm =
    farm &&
    db
      .prepare(
        "SELECT id FROM farms WHERE organization_id = ? ORDER BY id LIMIT 1",
      )
      .get(farm.id);
  const actors = {
    farm: db
      .prepare("SELECT id FROM users WHERE email = ?")
      .get("farm@agritrace.demo"),
    processor: db
      .prepare("SELECT id FROM users WHERE email = ?")
      .get("processor@agritrace.demo"),
    distributor: db
      .prepare("SELECT id FROM users WHERE email = ?")
      .get("distributor@agritrace.demo"),
  };

  if (
    !farm ||
    !processor ||
    !distributor ||
    !product ||
    !sourceFarm ||
    Object.values(actors).some((actor) => !actor)
  ) {
    throw new Error(
      "Cần seed các tổ chức, người dùng, sản phẩm và vùng trồng demo trước.",
    );
  }

  db.exec("BEGIN IMMEDIATE");
  try {
    const insertBatch = db.prepare(
      `INSERT INTO batches(
        batch_code, product_id, organization_id, source_farm_id,
        parent_batch_id, root_batch_id, source_batch_ids,
        initial_quantity, remaining_quantity, consumed_quantity,
        current_location, temperature_c, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const addBatch = ({
      code,
      owner,
      parentId = null,
      rootBatchId = null,
      sources,
      initial,
      remaining,
      consumed = 0,
      location,
      status = "processed",
    }) => {
      const row = insertBatch.run(
        code,
        product.id,
        owner.id,
        sourceFarm.id,
        parentId,
        rootBatchId,
        JSON.stringify(sources),
        initial,
        remaining,
        consumed,
        location,
        4.5,
        status,
      );
      const id = Number(row.lastInsertRowid);
      if (!rootBatchId) {
        db.prepare("UPDATE batches SET root_batch_id = ? WHERE id = ?").run(
          id,
          id,
        );
      }
      createEventLog({
        batchId: id,
        eventType: "batch_registered",
        actorId: actors[owner.type].id,
        data: {
          sample: true,
          source_batch_ids: sources,
          initial_quantity: initial,
          location,
        },
      });
      return id;
    };

    const rootId = addBatch({
      code: "BATCH-TRACE-DEMO-2026-ROOT",
      owner: { ...farm, type: "farm" },
      sources: [],
      initial: 500,
      remaining: 0,
      location: "Vùng trồng Tây Nguyên",
    });
    const harvestAt = new Date(
      Date.now() - 3 * 24 * 60 * 60 * 1000,
    ).toISOString();
    createEventLog({
      batchId: rootId,
      eventType: "batch_harvested",
      actorId: actors.farm.id,
      data: {
        product_name: "Dưa hấu đỏ",
        harvested_at: harvestAt,
        quantity_kg: 500,
      },
      timestamp: harvestAt,
    });

    const childQuantities = [150, 150, 200];
    const children = childQuantities.map((quantity, index) =>
      addBatch({
        code: `BATCH-TRACE-DEMO-2026-L1-${index + 1}`,
        owner: { ...processor, type: "processor" },
        parentId: rootId,
        rootBatchId: rootId,
        sources: [rootId],
        initial: quantity,
        remaining: 0,
        location: "HTX Sơ chế Hà Nội",
      }),
    );

    const middleSpecs = [
      {
        quantity: 100,
        sources: [children[0]],
        owner: processor,
        type: "processor",
      },
      {
        quantity: 150,
        sources: [children[0], children[1]],
        owner: processor,
        type: "processor",
      },
      {
        quantity: 150,
        sources: [children[1], children[2]],
        owner: distributor,
        type: "distributor",
      },
      {
        quantity: 100,
        sources: [children[2]],
        owner: distributor,
        type: "distributor",
      },
    ];
    const middle = middleSpecs.map((entry, index) =>
      addBatch({
        code: `BATCH-TRACE-DEMO-2026-L2-${index + 1}`,
        owner: { ...entry.owner, type: entry.type },
        rootBatchId: rootId,
        sources: entry.sources,
        initial: entry.quantity,
        remaining: 0,
        location:
          entry.type === "processor"
            ? "Kho HTX Hà Nội"
            : "Kho phân phối Hà Nội",
      }),
    );
    for (let index = 0; index < middle.length; index += 1) {
      createEventLog({
        batchId: middle[index],
        eventType: "batch_merged",
        actorId:
          middleSpecs[index].type === "processor"
            ? actors.processor.id
            : actors.distributor.id,
        data: {
          source_batch_ids: middleSpecs[index].sources,
          total_quantity: middleSpecs[index].quantity,
        },
      });
    }

    const leafSpecs = [
      {
        initial: 100,
        remaining: 100,
        consumed: 0,
        owner: distributor,
        type: "distributor",
        location: "Cửa hàng Organic Market",
      },
      {
        initial: 150,
        remaining: 100,
        consumed: 50,
        owner: distributor,
        type: "distributor",
        location: "Kho bán lẻ Hà Nội",
      },
      {
        initial: 150,
        remaining: 80,
        consumed: 70,
        owner: processor,
        type: "processor",
        location: "Kho lạnh HTX",
      },
      {
        initial: 100,
        remaining: 40,
        consumed: 60,
        owner: distributor,
        type: "distributor",
        location: "Cửa hàng Organic Market",
      },
    ];
    const leaves = leafSpecs.map((entry, index) =>
      addBatch({
        code: `BATCH-TRACE-DEMO-2026-L3-${index + 1}`,
        owner: { ...entry.owner, type: entry.type },
        parentId: middle[index],
        rootBatchId: rootId,
        sources: [middle[index]],
        initial: entry.initial,
        remaining: entry.remaining,
        consumed: entry.consumed,
        location: entry.location,
        status: index === 0 ? "delivered" : "in_transit",
      }),
    );

    const insertTemperature = db.prepare(
      "INSERT INTO temperature_logs(batch_id, temperature, source, timestamp) VALUES (?, ?, 'seed_sensor', ?)",
    );
    for (const [batchIndex, batchId] of leaves.entries()) {
      for (let sampleIndex = 0; sampleIndex < 6; sampleIndex += 1) {
        insertTemperature.run(
          batchId,
          3.6 + ((batchIndex + sampleIndex) % 5) * 0.35,
          new Date(
            Date.now() - (6 - sampleIndex) * 10 * 60 * 1000,
          ).toISOString(),
        );
      }
      createEventLog({
        batchId,
        eventType: "batch_transferred",
        actorId:
          leafSpecs[batchIndex].type === "processor"
            ? actors.processor.id
            : actors.distributor.id,
        data: { stage: "cold_chain_transport" },
      });
    }

    db.exec("COMMIT");
    return {
      created: true,
      rootBatchCode: "BATCH-TRACE-DEMO-2026-ROOT",
      batchCount: 12,
    };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  try {
    const result = seedFeatureDemoData();
    console.log(
      result.created
        ? `Seeded ${result.batchCount} trace-demo batches.`
        : "Feature demo seed already exists.",
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    getDb().close();
  }
}
