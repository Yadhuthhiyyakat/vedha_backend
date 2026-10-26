import { Router } from "express";
import {
  listInstitutions,
  submitDocumentForVerification,
  getInstitutionQueue,
  updateMyRole,
} from "../controllers/institution.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = Router();

// GET /api/institutions — list registered institutions
router.get("/", listInstitutions);

// All subsequent routes require authentication
router.use(requireAuth);

// GET /api/institutions/queue — view pending verification queue (institution only)
router.get("/queue", getInstitutionQueue);

// POST /api/institutions/submit/:docId — citizen submits document for verification
router.post("/submit/:docId", submitDocumentForVerification);

// PATCH /api/institutions/role — set role (institution vs citizen)
router.patch("/role", updateMyRole);

export default router;
