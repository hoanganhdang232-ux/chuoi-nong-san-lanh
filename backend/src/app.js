import express from "express";
import cors from "cors";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import authRoutes from "./routes/authRoutes.js";
import batchRoutes from "./routes/batchRoutes.js";
import transferRoutes from "./routes/transferRoutes.js";
import v1TransferRoutes from "./routes/v1TransferRoutes.js";
import featureRoutes from "./routes/featureRoutes.js";
import sprint4Routes from "./routes/sprint4Routes.js";
import sprint5Routes from "./routes/sprint5Routes.js";
import sprint6Routes from "./routes/sprint6Routes.js";
import sprint7Routes from "./routes/sprint7Routes.js";
import sprint8Routes from "./routes/sprint8Routes.js";
import { auditLogMiddleware } from "./middleware/auditLog.js";
import { runMigrations } from "./db/migrations.js";
import { ensureDemoFarmerAccount } from "./db/seed.js";
import { processOverdueTransfers } from "./services/transferService.js";
import { archiveOldTemperatureLogs } from "./services/sprint6ColdChainService.js";
import { startIntegrityWorkerCron } from "./services/sprint8IntegrityWorker.js";
import { getDb } from "./db/database.js";

const frontendDistPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../frontend/dist",
);

export function createApp() {
  const app = express();

  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: "5mb" }));
  app.use(auditLogMiddleware);

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

  app.use("/api/v1", sprint8Routes);
  app.use("/api/v1", sprint7Routes);
  app.use("/api/v1", sprint6Routes);
  app.use("/api/v1", sprint5Routes);
  app.use("/api/v1", sprint4Routes);
  app.use("/api/auth", authRoutes);
  app.use("/api/batches", batchRoutes);
  app.use("/api/v1/transfers", v1TransferRoutes);
  app.use("/api/transfers", transferRoutes);
  app.use("/api/features", featureRoutes);
  app.use("/api", sprint8Routes);
  app.use("/api", sprint7Routes);
  app.use("/api", sprint6Routes);
  app.use("/api", sprint4Routes);

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

  // T-104 & T-105: Định kỳ nén và archive log nhiệt độ cũ (>30 ngày) mỗi 24 giờ
  const archiveTimer = setInterval(() => {
    try {
      archiveOldTemperatureLogs(30);
    } catch (archiveErr) {
      console.warn("Background log archiving warning:", archiveErr.message);
    }
  }, 24 * 60 * 60 * 1000);
  archiveTimer.unref?.();

  // T-131: Định kỳ quét kiểm tra toàn vẹn Hash Chain toàn hệ thống mỗi 24 giờ
  startIntegrityWorkerCron();

  return app;
}
