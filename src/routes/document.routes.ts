import { Router } from "express";
import {
  getMyDocuments,
  getDocument,
  decryptDocument,
  createDocument,
  deleteDocument,
} from "../controllers/document.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import { createDocumentSchema } from "../validators/index.js";

const router = Router();

// All document routes require authentication
router.use(requireAuth);

// GET    /api/documents                    — list all owned documents (metadata only)
router.get("/", getMyDocuments);

// GET    /api/documents/:docId/decrypt     — decrypt and return document_data
// ⚠️  Must be declared BEFORE /:docId so Express does not swallow "decrypt" as a param
router.get("/:docId/decrypt", decryptDocument);

// GET    /api/documents/:docId             — get document metadata (no raw data)
router.get("/:docId", getDocument);

// POST   /api/documents                    — upload and encrypt a new document
router.post("/", validate(createDocumentSchema), createDocument);

// DELETE /api/documents/:docId             — delete an owned document
router.delete("/:docId", deleteDocument);

export default router;

