import { getDb } from "./src/db/database.js";
import { runMigrations } from "./src/db/migrations.js";
const db = getDb();

db.exec(`
  DROP TRIGGER IF EXISTS event_logs_prevent_update;
  DROP TRIGGER IF EXISTS event_logs_prevent_delete;
`);
db.exec("DELETE FROM event_logs");
db.exec("DELETE FROM batches");
db.exec("DELETE FROM products");
db.exec("DELETE FROM land_plots");
db.exec("DELETE FROM farms");
db.exec("DELETE FROM users");
db.exec("DELETE FROM organizations");
runMigrations();

const rows = [
  { name: "Farm Tây Nguyên", type: "farm", address: "Đắk Lắk" },
  { name: "HTX Sơ chế Hà Nội", type: "processor", address: "Hà Nội" },
  { name: "Cửa hàng Organic Market", type: "distributor", address: "Hà Nội" },
];
const organizationIds = {};
for (const organization of rows) {
  const row = db
    .prepare("INSERT INTO organizations(name, type, address) VALUES (?, ?, ?)")
    .run(organization.name, organization.type, organization.address);
  organizationIds[organization.type] = row.lastInsertRowid;
  console.log("org", organization.type, row.lastInsertRowid);
}

const farm = db
  .prepare(
    "INSERT INTO farms(organization_id, name, address, latitude, longitude) VALUES (?, ?, ?, ?, ?)",
  )
  .run(organizationIds.farm, "Vùng trồng Tây Nguyên", "Đắk Lắk", 12.7, 108.1);
console.log("farm", farm.lastInsertRowid);

const product = db
  .prepare("INSERT INTO products(organization_id, name, unit) VALUES (?, ?, ?)")
  .run(organizationIds.farm, "Dưa hấu đỏ", "kg");
console.log("product", product.lastInsertRowid);

try {
  const batch = db
    .prepare(
      "INSERT INTO batches(batch_code, product_id, organization_id, source_farm_id, initial_quantity, remaining_quantity, current_location, temperature_c, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      "BATCH-THA-2026-0001",
      product.lastInsertRowid,
      organizationIds.farm,
      farm.lastInsertRowid,
      500,
      420,
      "Vùng trồng Tây Nguyên",
      9,
      "registered",
    );
  console.log("batch", batch.lastInsertRowid);
} catch (error) {
  console.error("batch error", error);
  console.log("orgs", db.prepare("SELECT * FROM organizations").all());
  console.log("farms", db.prepare("SELECT * FROM farms").all());
  console.log("products", db.prepare("SELECT * FROM products").all());
  process.exitCode = 1;
}
