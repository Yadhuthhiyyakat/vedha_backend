import { Router } from "express";
import multer from "multer";
import {
  getMyDocuments,
  getCategories,
  getDocument,
  decryptDocument,
  createDocument,
  uploadDocumentFile,
  downloadDocumentFile,
  deleteDocument,
  updateDocument,
} from "../controllers/document.controller.js";
import {
  autoVerifyDocument,
  updateDocumentStatus,
} from "../controllers/verification.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import {
  createDocumentSchema,
  updateDocumentSchema,
  updateDocumentStatusSchema,
} from "../validators/index.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB max file size
});

const router = Router();

// All document routes require authentication
router.use(requireAuth);

// GET    /api/documents/categories         — list available document category taxonomy
router.get("/categories", getCategories);

// GET    /api/documents                    — list all owned documents (supports ?category=&subcategory= filter)
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

// POST   /api/documents/:docId/verify      — run automated algorithmic verification
router.post("/:docId/verify", autoVerifyDocument);

// PATCH  /api/documents/:docId/status      — institutional / admin status update with notes
router.patch("/:docId/status", validate(updateDocumentStatusSchema), updateDocumentStatus);

// PATCH  /api/documents/:docId             — edit an owned document (title, type, category, subcategory, expiry_date, document_data)
router.patch("/:docId", validate(updateDocumentSchema), updateDocument);
router.put("/:docId", validate(updateDocumentSchema), updateDocument);

// DELETE /api/documents/:docId             — delete an owned document and bucket file
router.delete("/:docId", deleteDocument);

export default router;

