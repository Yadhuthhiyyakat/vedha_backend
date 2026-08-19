import { Router } from "express";
import {
  getMyDocuments,
  getDocument,
  createDocument,
  deleteDocument,
} from "../controllers/document.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import { createDocumentSchema } from "../validators/index.js";

const router = Router();

// All document routes require authentication
router.use(requireAuth);

// GET    /api/documents            — list all owned documents
router.get("/", getMyDocuments);

// GET    /api/documents/:docId     — get a single owned document
router.get("/:docId", getDocument);

// POST   /api/documents            — create a new document
router.post("/", validate(createDocumentSchema), createDocument);

// DELETE /api/documents/:docId     — delete an owned document
router.delete("/:docId", deleteDocument);

export default router;
