import express from "express";
import cors from "cors";
import authRoutes from "./routes/authRoutes.js";
import batchRoutes from "./routes/batchRoutes.js";
import transferRoutes from "./routes/transferRoutes.js";
import featureRoutes from "./routes/featureRoutes.js";
import { runMigrations } from "./db/migrations.js";
import { ensureDemoFarmerAccount } from "./db/seed.js";

export function createApp() {
  const app = express();

  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", service: "agritrace-backend" });
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/batches", batchRoutes);
  app.use("/api/transfers", transferRoutes);
  app.use("/api/features", featureRoutes);

  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ message: "Đã xảy ra lỗi máy chủ." });
  });

  runMigrations();
  ensureDemoFarmerAccount();
  return app;
}
