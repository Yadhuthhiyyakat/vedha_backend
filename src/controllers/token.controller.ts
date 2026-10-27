import { Request, Response } from "express";
import { AuthenticatedRequest } from "../middleware/auth.middleware.js";
import { supabaseAdmin } from "../config/supabase.js";
import crypto from "crypto";
import { decryptData, decryptBuffer } from "../services/encryption.service.js";

const STORAGE_BUCKET = "documents";

// Set of internal/technical database & cryptographic attributes that must NEVER be exposed
const SENSITIVE_TECHNICAL_KEYS = new Set([
  "id",
  "owner_id",
  "user_id",
  "type",
  "created_at",
  "updated_at",
  "is_encrypted",
  "encryption_key_version",
  "key_version",
  "file_path",
  "filepath",
  "document_data",
  "iv",
  "tag",
  "ciphertext",
  "auth_tag",
  "file_url",
  "fileurl",
]);

// ─── POST /api/tokens ─────────────────────────────────────────────────────────
// Creates a short-lived QR verification token for a document
export const createToken = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const userId = req.user!.id;
  const {
    document_id,
    expires_in_minutes = 10,
    shared_fields,
    allowed_emails,
  } = req.body as {
    document_id: string;
    expires_in_minutes?: number;
    shared_fields?: string[];
    allowed_emails?: string[];
  };

  // Confirm the user owns the document
  const { data: doc } = await supabaseAdmin
    .from("documents")
    .select("id")
    .eq("id", document_id)
    .eq("owner_id", userId)
    .single();

  if (!doc) {
    res.status(403).json({ error: "Document not found or access denied" });
    return;
  }

  const token = crypto.randomBytes(32).toString("hex");
  const expires_at = new Date(
    Date.now() + expires_in_minutes * 60 * 1000
  ).toISOString();

  const cleanEmails =
    allowed_emails && allowed_emails.length > 0
      ? allowed_emails.map((e) => e.trim().toLowerCase()).filter(Boolean)
      : null;

  const insertPayload: Record<string, unknown> = {
    document_id,
    token,
    expires_at,
    shared_fields: shared_fields ?? null,
  };
  if (cleanEmails && cleanEmails.length > 0) {
    insertPayload.allowed_emails = cleanEmails;
  }

  const { data, error } = await supabaseAdmin
    .from("verification_tokens")
    .insert(insertPayload)
    .select()
    .single();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.status(201).json(data);
};

// ─── GET /api/tokens/verify/:token ───────────────────────────────────────────
// Public endpoint: verifies a token and returns clean document info
export const verifyToken = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { token } = req.params as { token: string };
  const verifierId = (req as AuthenticatedRequest).user?.id ?? null;

  // Fetch the token
  const { data: tokenRow, error: tokenErr } = await supabaseAdmin
    .from("verification_tokens")
    .select("*, documents(*)")
    .eq("token", token)
    .single();

  if (tokenErr || !tokenRow) {
    await writeVerificationLog(null, verifierId, "failed");
    res.status(404).json({ error: "Token not found" });
    return;
  }

  if (new Date(tokenRow.expires_at) < new Date()) {
    await writeVerificationLog(tokenRow.document_id as string, verifierId, "failed");
    res.status(410).json({ error: "Token has expired" });
    return;
  }

  // ─── Enforce Email RBAC (View-Only Restriction) ──────────────────────────
  const allowedEmails = tokenRow.allowed_emails as string[] | null;
  if (allowedEmails && allowedEmails.length > 0) {
    const authUser = (req as AuthenticatedRequest).user;
    if (!authUser || !authUser.email) {
      await writeVerificationLog(tokenRow.document_id as string, verifierId, "failed");
      res.status(401).json({
        error: "Authentication required: This document can only be viewed by authorized email addresses. Please log in.",
        code: "AUTH_REQUIRED",
      });
      return;
    }
    const userEmail = authUser.email.toLowerCase().trim();
    const authorized = allowedEmails.map((e) => e.toLowerCase().trim()).includes(userEmail);
    if (!authorized) {
      await writeVerificationLog(tokenRow.document_id as string, verifierId, "failed");
      res.status(403).json({
        error: `Access Denied: Your account (${authUser.email}) is not authorized to view this document.`,
        code: "RBAC_FORBIDDEN",
      });
      return;
    }
  }

  const document = (tokenRow.documents as Record<string, unknown>) || {};

  // If document_data contains an encrypted blob, attempt decryption
  let innerData: Record<string, unknown> = {};
  let fileMeta: { file_path?: string; file_name?: string; mime_type?: string } = {};

  if (document && document.document_data) {
    try {
      const plaintext = decryptData(document.document_data as any);
      innerData = JSON.parse(plaintext);
      if (innerData.file_path) {
        fileMeta = {
          file_path: innerData.file_path as string,
          file_name: innerData.file_name as string | undefined,
          mime_type: innerData.mime_type as string | undefined,
        };
      }
    } catch {
      // If unencrypted or decryption fails, ignore
    }
  }

  // Combine top-level document fields with decrypted innerData, strictly removing sensitive technical keys
  const combinedRaw: Record<string, unknown> = {
    title: document.title,
    category: document.category,
    subcategory: document.subcategory,
    status: document.status,
    expiry_date: document.expiry_date,
    ...innerData,
  };

  const cleanData: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(combinedRaw)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!SENSITIVE_TECHNICAL_KEYS.has(key) && !SENSITIVE_TECHNICAL_KEYS.has(normalizedKey) && value !== undefined && value !== null) {
      cleanData[key] = value;
    }
  }

  // Check if file sharing was permitted for this token
  const sharedFields = tokenRow.shared_fields as string[] | null;
  const allowFileShare =
    !!fileMeta.file_path &&
    !!sharedFields &&
    sharedFields.some((f) =>
      ["file", "document_file", "photo", "file_url", "attachment"].includes(f.toLowerCase().trim())
    );

  // Filter to only shared fields if specified
  let exposedData: Record<string, unknown> = {};
  if (sharedFields && sharedFields.length > 0) {
    for (const field of sharedFields) {
      const cleanField = field.trim();
      // Skip file share pseudo-field in attribute list
      if (["file", "document_file", "photo", "file_url", "attachment"].includes(cleanField.toLowerCase())) {
        continue;
      }
      if (cleanField in cleanData) {
        exposedData[cleanField] = cleanData[cleanField];
      }
    }
  } else {
    exposedData = cleanData;
  }

  await writeVerificationLog(tokenRow.document_id as string, verifierId, "success");

  const responsePayload: Record<string, unknown> = {
    valid: true,
    expires_at: tokenRow.expires_at,
    document_id: tokenRow.document_id,
    target_institution: document.target_institution || null,
    submission_status: document.submission_status || null,
    document: exposedData,
    verification_seal: document.verification_seal || null,
  };

  if (allowFileShare) {
    responsePayload.file_url = `/api/tokens/verify/${token}/file`;
    responsePayload.file_name = fileMeta.file_name || `${document.title || "document"}`;
    responsePayload.mime_type = fileMeta.mime_type || "application/octet-stream";
  }

  res.json(responsePayload);
};

// ─── GET /api/tokens/verify/:token/file ──────────────────────────────────────
// Public endpoint: Streams decrypted document photo or file if authorized by token
export const getVerifiedDocumentFile = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { token } = req.params as { token: string };

  // Fetch token & document
  const { data: tokenRow, error: tokenErr } = await supabaseAdmin
    .from("verification_tokens")
    .select("*, documents(*)")
    .eq("token", token)
    .single();

  if (tokenErr || !tokenRow) {
    res.status(404).json({ error: "Token not found" });
    return;
  }

  if (new Date(tokenRow.expires_at) < new Date()) {
    res.status(410).json({ error: "Token has expired" });
    return;
  }

  // Enforce Email RBAC for file download
  const fileAllowedEmails = tokenRow.allowed_emails as string[] | null;
  if (fileAllowedEmails && fileAllowedEmails.length > 0) {
    const authUser = (req as AuthenticatedRequest).user;
    if (!authUser || !authUser.email) {
      res.status(401).json({
        error: "Authentication required: This file can only be viewed by authorized email addresses.",
        code: "AUTH_REQUIRED",
      });
      return;
    }
    const userEmail = authUser.email.toLowerCase().trim();
    if (!fileAllowedEmails.map((e) => e.toLowerCase().trim()).includes(userEmail)) {
      res.status(403).json({
        error: `Access Denied: Your account (${authUser.email}) is not authorized to view this file.`,
        code: "RBAC_FORBIDDEN",
      });
      return;
    }
  }

  const sharedFields = tokenRow.shared_fields as string[] | null;
  const allowFileShare =
    !!sharedFields &&
    sharedFields.some((f) =>
      ["file", "document_file", "photo", "file_url", "attachment"].includes(f.toLowerCase().trim())
    );

  if (!allowFileShare) {
    res.status(403).json({ error: "File sharing was not permitted for this verification token" });
    return;
  }

  const document = (tokenRow.documents as Record<string, unknown>) || {};
  if (!document || !document.document_data) {
    res.status(404).json({ error: "No file associated with this document" });
    return;
  }

  try {
    const plaintext = decryptData(document.document_data as any);
    const meta = JSON.parse(plaintext) as {
      file_path?: string;
      mime_type?: string;
      file_name?: string;
    };

    if (!meta.file_path) {
      res.status(404).json({ error: "No file stored for this document" });
      return;
    }

    const { data: fileBlob, error: downloadErr } = await supabaseAdmin.storage
      .from(STORAGE_BUCKET)
      .download(meta.file_path);

    if (downloadErr || !fileBlob) {
      res.status(404).json({ error: "Encrypted file not found in storage bucket" });
      return;
    }

    const arrayBuffer = await fileBlob.arrayBuffer();
    const encryptedBuffer = Buffer.from(arrayBuffer);
    const decryptedBuffer = decryptBuffer(encryptedBuffer);

    const mimeType = meta.mime_type || "application/octet-stream";
    const fileName = meta.file_name || `${document.title || "document"}.bin`;

    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Disposition", `inline; filename=\"${fileName}\"`);
    res.send(decryptedBuffer);
  } catch (err) {
    console.error("[getVerifiedDocumentFile] Error:", err);
    res.status(500).json({ error: "Failed to download or decrypt document file" });
  }
};

// ─── GET /api/tokens — list tokens for a document ────────────────────────────
export const getTokensForDocument = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const userId = req.user!.id;
  const { document_id } = req.query as { document_id?: string };

  if (!document_id) {
    res.status(400).json({ error: "document_id query param is required" });
    return;
  }

  // Verify ownership
  const { data: doc } = await supabaseAdmin
    .from("documents")
    .select("id")
    .eq("id", document_id)
    .eq("owner_id", userId)
    .single();

  if (!doc) {
    res.status(403).json({ error: "Document not found or access denied" });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("verification_tokens")
    .select("id, document_id, token, expires_at, shared_fields, created_at")
    .eq("document_id", document_id)
    .order("created_at", { ascending: false });

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json(data);
};

// ─── DELETE /api/tokens/:tokenId ─────────────────────────────────────────────
export const revokeToken = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const userId = req.user!.id;
  const { tokenId } = req.params as { tokenId: string };

  // Confirm ownership via document
  const { data: tokenRow } = await supabaseAdmin
    .from("verification_tokens")
    .select("id, documents(owner_id)")
    .eq("id", tokenId)
    .single();

  if (!tokenRow) {
    res.status(404).json({ error: "Token not found" });
    return;
  }

  const doc = tokenRow.documents as unknown as { owner_id: string } | null;
  if (doc?.owner_id !== userId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const { error } = await supabaseAdmin
    .from("verification_tokens")
    .delete()
    .eq("id", tokenId);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.status(204).send();
};

// ─── Helper: write an audit log entry ────────────────────────────────────────
async function writeVerificationLog(
  document_id: string | null,
  verifier_id: string | null,
  status: "success" | "failed"
) {
  await supabaseAdmin.from("verification_logs").insert({
    document_id,
    verifier_id,
    status,
  });
}
