import { Router } from "express";
import multer from "multer";
import {
  getMyDocuments,
  getDocument,
  decryptDocument,
  createDocument,
  uploadDocumentFile,
  downloadDocumentFile,
  deleteDocument,
} from "../controllers/document.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import { createDocumentSchema } from "../validators/index.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB max file size
});

const router = Router();

// All document routes require authentication
router.use(requireAuth);

// GET    /api/documents                    — list all owned documents (metadata only)
router.get("/", getMyDocuments);

// GET    /api/documents/:docId/decrypt     — decrypt and return document_data JSON
router.get("/:docId/decrypt", decryptDocument);

// GET    /api/documents/:docId/file        — download & decrypt stored file photo/pdf
router.get("/:docId/file", downloadDocumentFile);

// GET    /api/documents/:docId             — get document metadata (no raw data)
router.get("/:docId", getDocument);

// POST   /api/documents/upload             — upload photo/file, encrypt & store in bucket
router.post("/upload", upload.single("file"), uploadDocumentFile);

// POST   /api/documents                    — create document with JSON payload (encrypted)
router.post("/", validate(createDocumentSchema), createDocument);

// DELETE /api/documents/:docId             — delete an owned document and bucket file
router.delete("/:docId", deleteDocument);

export default router;

