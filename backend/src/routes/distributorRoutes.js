import { Router } from "express";
import { authenticateToken } from "../middleware/auth.js";
import { batchController } from "../controllers/batchController.js";

/**
 * Distributor Routes
 * Handles distributor-specific actions on batches (lots)
 */
const router = Router();

// Authenticate all routes
router.use(authenticateToken);

/**
 * PATCH /api/v1/distributor/lots/:id/sell-out
 * Mark a batch (lot) as sold out when all products in the batch have been
 * distributed to consumers by the distributor.
 */
router.patch(
  "/lots/:id/sell-out",
  (req, res) => {
    batchController.sellOut(req, res);
  }
);

export default router;
