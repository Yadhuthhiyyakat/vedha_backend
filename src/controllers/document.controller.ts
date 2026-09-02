import { Response } from "express";
import { AuthenticatedRequest } from "../middleware/auth.middleware.js";
import { supabaseAdmin } from "../config/supabase.js";
import {
  encryptData,
  decryptData,
  encryptBuffer,
  decryptBuffer,
} from "../services/encryption.service.js";

import { DOCUMENT_CATEGORIES } from "../config/categories.js";

// ─── Column sets ──────────────────────────────────────────────────────────────
// Never expose raw document_data (encrypted blob) in list / detail meta views
const DOCUMENT_META_COLUMNS =
  "id, owner_id, title, type, category, subcategory, status, created_at";

const STORAGE_BUCKET = "documents";

// Helper: Ensure the storage bucket exists in Supabase
async function ensureBucket() {
  try {
    const { data: buckets } = await supabaseAdmin.storage.listBuckets();
    if (!buckets?.some((b) => b.name === STORAGE_BUCKET)) {
      await supabaseAdmin.storage.createBucket(STORAGE_BUCKET, { public: false });
    }
  } catch (err) {
    console.error("[ensureBucket] Warning:", err);
  }
}

// ─── GET /api/documents/categories ──────────────────────────────────────────
export const getCategories = async (
  _req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const { data: categories, error } = await supabaseAdmin
      .from("document_categories")
      .select("id, name, description, document_subcategories (id, name, description, required_fields)");

    if (!error && categories && categories.length > 0) {
      const formatted = categories.map((cat: {
        id: string;
        name: string;
        description: string;
        document_subcategories?: Array<{
          id: string;
          name: string;
          description?: string;
          required_fields?: string[];
        }>;
      }) => ({
        id: cat.id,
        name: cat.name,
        description: cat.description,
        subcategories: cat.document_subcategories || [],
      }));
      res.json({ categories: formatted });
      return;
    }
  } catch (err) {
    console.warn("[getCategories] Falling back to static category config:", err);
  }

  // Fallback to static category config if DB tables are empty
  res.json({ categories: DOCUMENT_CATEGORIES });
};

// ─── GET /api/documents ───────────────────────────────────────────────────────
export const getMyDocuments = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const userId = req.user!.id;
  const { category, subcategory } = req.query as {
    category?: string;
    subcategory?: string;
  };

  let query = supabaseAdmin
    .from("documents")
    .select(DOCUMENT_META_COLUMNS)
    .eq("owner_id", userId)
    .order("created_at", { ascending: false });

  if (category) {
    query = query.eq("category", category);
  }
  if (subcategory) {
    query = query.eq("subcategory", subcategory);
  }

  const { data, error } = await query;

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json(data);
};

// ─── GET /api/documents/:docId ────────────────────────────────────────────────
export const getDocument = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const userId = req.user!.id;
  const { docId } = req.params as { docId: string };

  const { data, error } = await supabaseAdmin
    .from("documents")
    .select(DOCUMENT_META_COLUMNS)
    .eq("id", docId)
    .eq("owner_id", userId)
    .single();

  if (error || !data) {
    res.status(404).json({ error: "Document not found" });
    return;
  }

  res.json(data);
};

// ─── GET /api/documents/:docId/decrypt ───────────────────────────────────────
export const decryptDocument = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const userId = req.user!.id;
  const { docId } = req.params as { docId: string };

  const { data, error } = await supabaseAdmin
    .from("documents")
    .select("id, owner_id, document_data, title, type, category, subcategory, status")
    .eq("id", docId)
    .eq("owner_id", userId)
    .single();

  if (error || !data) {
    res.status(404).json({ error: "Document not found" });
    return;
  }

  if (!data.document_data) {
    res.status(400).json({ error: "Document has no content to decrypt" });
    return;
  }

  try {
    const plaintext = decryptData(data.document_data);
    const document_data = JSON.parse(plaintext) as Record<string, unknown>;

    res.json({
      id: data.id,
      title: data.title,
      type: data.type,
      category: data.category ?? "other",
      subcategory: data.subcategory ?? "other",
      status: data.status,
      document_data,
    });
  } catch (err) {
    console.error("[decryptDocument] decryption error:", err);
    res
      .status(500)
      .json({ error: "Decryption failed — data may be corrupted, unencrypted, or tampered with" });
  }
};

// ─── POST /api/documents ──────────────────────────────────────────────────────
export const createDocument = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const userId = req.user!.id;
  const { title, type, category, subcategory, document_data } = req.body as {
    title: string;
    type: string;
    category?: string;
    subcategory?: string;
    document_data?: Record<string, unknown>;
  };

  // Encrypt document_data if provided and store inside document_data column
  let encryptedPayload: string | null = null;

  if (document_data && Object.keys(document_data).length > 0) {
    try {
      encryptedPayload = encryptData(JSON.stringify(document_data));
    } catch (err) {
      console.error("[createDocument] encryption error:", err);
      res.status(500).json({ error: "Failed to encrypt document data" });
      return;
    }
  }

  const { data, error } = await supabaseAdmin
    .from("documents")
    .insert({
      owner_id: userId,
      title,
      type,
      category: category || "other",
      subcategory: subcategory || "other",
      document_data: encryptedPayload,
      status: "pending",
    })
    .select(DOCUMENT_META_COLUMNS)
    .single();

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }

  res.status(201).json(data);
};

// ─── POST /api/documents/upload ──────────────────────────────────────────────
// Encrypts uploaded file photo/pdf buffer and uploads to Supabase Storage bucket
export const uploadDocumentFile = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const userId = req.user!.id;
  const file = req.file;

  if (!file) {
    res.status(400).json({ error: "No file attached. Please attach a file photo or PDF" });
    return;
  }

  const { title, type, category, subcategory } = req.body as {
    title: string;
    type: string;
    category?: string;
    subcategory?: string;
  };
  if (!title || !type) {
    res.status(400).json({ error: "title and type form fields are required" });
    return;
  }

  await ensureBucket();

  try {
    // 1. Encrypt the raw file buffer with AES-256-GCM
    const encryptedFileBuffer = encryptBuffer(file.buffer);

    // 2. Storage path inside the bucket
    const cleanFileName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${userId}/${Date.now()}_${cleanFileName}.enc`;

    // 3. Upload encrypted buffer to Supabase Storage
    const { error: uploadError } = await supabaseAdmin.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, encryptedFileBuffer, {
        contentType: "application/octet-stream", // Raw encrypted ciphertext
        upsert: true,
      });

    if (uploadError) {
      console.error("[uploadDocumentFile] Supabase storage error:", uploadError);
      res.status(500).json({ error: `Storage upload failed: ${uploadError.message}` });
      return;
    }

    // 4. Parse optional additional document_data fields if provided
    let additionalData: Record<string, unknown> = {};
    if (req.body.document_data) {
      try {
        additionalData = typeof req.body.document_data === "string"
          ? JSON.parse(req.body.document_data)
          : req.body.document_data;
      } catch {
        // Ignore JSON parse errors if document_data is string
      }
    }

    // 5. Store file reference metadata inside encrypted document_data column
    const fileMetadata = {
      file_path: storagePath,
      file_name: file.originalname,
      mime_type: file.mimetype,
      size: file.size,
      ...additionalData,
    };

    const encryptedDataPayload = encryptData(JSON.stringify(fileMetadata));

    // 6. Insert document record in database
    const { data, error } = await supabaseAdmin
      .from("documents")
      .insert({
        owner_id: userId,
        title,
        type,
        category: category || "other",
        subcategory: subcategory || "other",
        document_data: encryptedDataPayload,
        status: "pending",
      })
      .select(DOCUMENT_META_COLUMNS)
      .single();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    res.status(201).json(data);
  } catch (err) {
    console.error("[uploadDocumentFile] Error:", err);
    res.status(500).json({ error: "Failed to encrypt and store document file" });
  }
};

// ─── GET /api/documents/:docId/file ───────────────────────────────────────────
// Downloads encrypted file from Supabase bucket, decrypts it, and streams back
export const downloadDocumentFile = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const userId = req.user!.id;
  const { docId } = req.params as { docId: string };

  const { data: doc, error } = await supabaseAdmin
    .from("documents")
    .select("id, owner_id, document_data, title")
    .eq("id", docId)
    .eq("owner_id", userId)
    .single();

  if (error || !doc) {
    res.status(404).json({ error: "Document not found" });
    return;
  }

  if (!doc.document_data) {
    res.status(404).json({ error: "Document has no file associated with it" });
    return;
  }

  try {
    // 1. Decrypt document_data to extract file_path and mime_type
    const plaintext = decryptData(doc.document_data);
    const meta = JSON.parse(plaintext) as {
      file_path?: string;
      mime_type?: string;
      file_name?: string;
    };

    if (!meta.file_path) {
      res.status(404).json({ error: "No file stored for this document" });
      return;
    }

    // 2. Download encrypted binary blob from Supabase Storage
    const { data: fileBlob, error: downloadErr } = await supabaseAdmin.storage
      .from(STORAGE_BUCKET)
      .download(meta.file_path);

    if (downloadErr || !fileBlob) {
      res.status(404).json({ error: "Encrypted file not found in storage bucket" });
      return;
    }

    // 3. Convert Blob to Buffer
    const arrayBuffer = await fileBlob.arrayBuffer();
    const encryptedBuffer = Buffer.from(arrayBuffer);

    // 4. Decrypt the binary buffer using AES-256-GCM
    const decryptedBuffer = decryptBuffer(encryptedBuffer);

    // 5. Send back original file with appropriate headers
    const mimeType = meta.mime_type || "application/octet-stream";
    const fileName = meta.file_name || `${doc.title}.bin`;

    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
    res.send(decryptedBuffer);
  } catch (err) {
    console.error("[downloadDocumentFile] Error:", err);
    res.status(500).json({ error: "Failed to download or decrypt file" });
  }
};

// ─── DELETE /api/documents/:docId ─────────────────────────────────────────────
export const deleteDocument = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const userId = req.user!.id;
  const { docId } = req.params as { docId: string };

  // Confirm ownership before deleting
  const { data: existing } = await supabaseAdmin
    .from("documents")
    .select("id, document_data")
    .eq("id", docId)
    .eq("owner_id", userId)
    .single();

  if (!existing) {
    res.status(404).json({ error: "Document not found" });
    return;
  }

  // Attempt to delete encrypted file from bucket if present
  if (existing.document_data) {
    try {
      const plaintext = decryptData(existing.document_data);
      const meta = JSON.parse(plaintext) as { file_path?: string };
      if (meta.file_path) {
        await supabaseAdmin.storage.from(STORAGE_BUCKET).remove([meta.file_path]);
      }
    } catch {
      // Ignore if document_data was not encrypted JSON or file_path missing
    }
  }

  const { error } = await supabaseAdmin
    .from("documents")
    .delete()
    .eq("id", docId);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.status(204).send();
};
