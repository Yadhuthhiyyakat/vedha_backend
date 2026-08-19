import { Router } from "express";
import {
  createToken,
  verifyToken,
  getTokensForDocument,
  revokeToken,
} from "../controllers/token.controller.js";
import { requireAuth, optionalAuth } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import { createTokenSchema } from "../validators/index.js";

const router = Router();

// GET  /api/tokens/verify/:token — PUBLIC endpoint, optionally authenticated
// Used by QR-code scanners to verify a document without being logged in
router.get("/verify/:token", optionalAuth, verifyToken);

// All remaining token routes require authentication
router.use(requireAuth);

// GET    /api/tokens?document_id=<uuid>  — list tokens for a document
router.get("/", getTokensForDocument);

// POST   /api/tokens                     — generate a new verification token
router.post("/", validate(createTokenSchema), createToken);

// DELETE /api/tokens/:tokenId            — revoke a token
router.delete("/:tokenId", revokeToken);

export default router;
