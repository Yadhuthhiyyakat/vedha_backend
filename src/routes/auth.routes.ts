import { Router } from "express";
import { signup, login, refresh, logout, me } from "../controllers/auth.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import {
  signupSchema,
  loginSchema,
  refreshSchema,
} from "../validators/auth.validators.js";

const router = Router();

// POST /api/auth/signup    — create account, returns user object (no token yet)
router.post("/signup", validate(signupSchema), signup);

// POST /api/auth/login     — returns { access_token, refresh_token, expires_in }
router.post("/login", validate(loginSchema), login);

// POST /api/auth/refresh   — exchange refresh_token → new token pair
router.post("/refresh", validate(refreshSchema), refresh);

// POST /api/auth/logout    — requires valid access_token; revokes server-side session
router.post("/logout", requireAuth, logout);

// GET  /api/auth/me        — requires valid access_token; returns profile
router.get("/me", requireAuth, me);

export default router;
