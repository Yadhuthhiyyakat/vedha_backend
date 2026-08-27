import { Response } from "express";
import { AuthenticatedRequest } from "../middleware/auth.middleware.js";
import { supabaseAdmin } from "../config/supabase.js";
import {
  encryptData,
  decryptData,
} from "../services/encryption.service.js";

// ─── Column sets ──────────────────────────────────────────────────────────────
// Never expose raw document_data (encrypted blob) in list / detail meta views
const DOCUMENT_META_COLUMNS =
  "id, owner_id, title, type, status, created_at";

// ─── GET /api/documents ───────────────────────────────────────────────────────
export const getMyDocuments = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const userId = req.user!.id;

  const { data, error } = await supabaseAdmin
    .from("documents")
    .select(DOCUMENT_META_COLUMNS)
    .eq("owner_id", userId)
    .order("created_at", { ascending: false });

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
    .select("id, owner_id, document_data, title, type, status")
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
  const { title, type, document_data } = req.body as {
    title: string;
    type: string;
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
    .select("id")
    .eq("id", docId)
    .eq("owner_id", userId)
    .single();

  if (!existing) {
    res.status(404).json({ error: "Document not found" });
    return;
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
