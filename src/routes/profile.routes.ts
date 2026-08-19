import { Router } from "express";
import {
  getMyProfile,
  getProfile,
  updateMyProfile,
} from "../controllers/profile.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import { updateProfileSchema } from "../validators/index.js";

const router = Router();

// GET  /api/profiles/me       — get the current user's profile
router.get("/me", requireAuth, getMyProfile);

// PATCH /api/profiles/me      — update the current user's profile
router.patch("/me", requireAuth, validate(updateProfileSchema), updateMyProfile);

// GET  /api/profiles/:userId  — get any user's public profile
router.get("/:userId", getProfile);

export default router;
