import { Router } from "express";
import { getMyLogs } from "../controllers/log.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = Router();

// All log routes require authentication
router.use(requireAuth);

// GET /api/logs                      — all logs for the user's documents
// GET /api/logs?document_id=<uuid>   — logs for a specific document
router.get("/", getMyLogs);

export default router;
