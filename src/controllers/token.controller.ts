import { Request, Response } from "express";
import { AuthenticatedRequest } from "../middleware/auth.middleware.js";
import { supabaseAdmin } from "../config/supabase.js";
import crypto from "crypto";
import { decryptData } from "../services/encryption.service.js";

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
  } = req.body as {
    document_id: string;
    expires_in_minutes?: number;
    shared_fields?: string[];
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

  const { data, error } = await supabaseAdmin
    .from("verification_tokens")
    .insert({
      document_id,
      token,
      expires_at,
      shared_fields: shared_fields ?? null,
    })
    .select()
    .single();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.status(201).json(data);
};

// ─── GET /api/tokens/:token ───────────────────────────────────────────────────
// Public endpoint: verifies a token and returns document info
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

  const document = tokenRow.documents as Record<string, unknown>;

  // If document_data contains an encrypted blob, attempt decryption
  let innerData: Record<string, unknown> = {};
  if (document && document.document_data) {
    try {
      const plaintext = decryptData(document.document_data);
      innerData = JSON.parse(plaintext);
    } catch {
      // If unencrypted or decryption fails, ignore
    }
  }

  const combined: Record<string, unknown> = { ...document, document_data: innerData, ...innerData };

  // Filter to only shared fields if specified
  let exposedData: Record<string, unknown> = combined;
  const sharedFields = tokenRow.shared_fields as string[] | null;
  if (sharedFields && sharedFields.length > 0) {
    exposedData = {};
    for (const field of sharedFields) {
      if (field in combined) {
        exposedData[field] = combined[field];
      }
    }
  }

  await writeVerificationLog(tokenRow.document_id as string, verifierId, "success");

  res.json({
    valid: true,
    expires_at: tokenRow.expires_at,
    document: exposedData,
  });
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
    .select("id, token, expires_at, shared_fields, created_at")
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
