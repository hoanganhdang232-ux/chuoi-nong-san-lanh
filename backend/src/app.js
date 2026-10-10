import express from "express";
import cors from "cors";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import authRoutes from "./routes/authRoutes.js";
import batchRoutes from "./routes/batchRoutes.js";
import transferRoutes from "./routes/transferRoutes.js";
import v1TransferRoutes from "./routes/v1TransferRoutes.js";
import featureRoutes from "./routes/featureRoutes.js";
import { runMigrations } from "./db/migrations.js";
import { ensureDemoFarmerAccount } from "./db/seed.js";
import { processOverdueTransfers } from "./services/transferService.js";
import { getDb } from "./db/database.js";

const frontendDistPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../frontend/dist",
);

export function createApp() {
  const app = express();

  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (req, res) => {
    try {
      getDb().prepare("SELECT 1 AS healthy").get();
      return res.json({ status: "ok", service: "agritrace-backend", database: "ok" });
    } catch (error) {
      console.error("Health check failed", error);
      return res.status(503).json({
        status: "error",
        service: "agritrace-backend",
        database: "unavailable",
      });
    }
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/batches", batchRoutes);
  app.use("/api/v1/transfers", v1TransferRoutes);
  app.use("/api/transfers", transferRoutes);
  app.use("/api/features", featureRoutes);

  app.use("/api", (req, res) => {
    res.status(404).json({ message: "Không tìm thấy API." });
  });
  app.use(express.static(frontendDistPath));
  app.get("/{*splat}", (req, res, next) => {
    res.sendFile(resolve(frontendDistPath, "index.html"), (error) => {
      if (error) next(error);
    });
  });

  app.use((err, req, res, _next) => {
    console.error(err);
    res.status(500).json({ message: "Đã xảy ra lỗi máy chủ." });
  });

  runMigrations();
  ensureDemoFarmerAccount();
  // Run once at startup and then hourly. The interval is intentionally
  // unref'd so it never prevents tests or a graceful server shutdown.
  processOverdueTransfers();
  const overdueTimer = setInterval(processOverdueTransfers, 60 * 60 * 1000);
  overdueTimer.unref?.();
  return app;
}
