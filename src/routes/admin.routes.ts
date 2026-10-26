import { Router } from "express";
import {
  getAdminStats,
  listUsers,
  assignUserRole,
} from "../controllers/admin.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = Router();

// All admin routes require authentication
router.use(requireAuth);

// GET /api/admin/stats — overview counts
router.get("/stats", getAdminStats);

// GET /api/admin/users — search and filter users
router.get("/users", listUsers);

// PATCH /api/admin/users/:userId/role — assign role and institution profile
router.patch("/users/:userId/role", assignUserRole);

export default router;
