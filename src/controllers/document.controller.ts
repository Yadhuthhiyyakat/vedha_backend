import { Response } from "express";
import { AuthenticatedRequest } from "../middleware/auth.middleware.js";
import { supabaseAdmin } from "../config/supabase.js";

// ─── GET /api/documents ───────────────────────────────────────────────────────
export const getMyDocuments = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const userId = req.user!.id;

  const { data, error } = await supabaseAdmin
    .from("documents")
    .select("*")
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
    .select("*")
    .eq("id", docId)
    .eq("owner_id", userId)
    .single();

  if (error || !data) {
    res.status(404).json({ error: "Document not found" });
    return;
  }

  res.json(data);
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

  const { data, error } = await supabaseAdmin
    .from("documents")
    .insert({
      owner_id: userId,
      title,
      type,
      document_data: document_data ?? null,
      status: "pending",
    })
    .select()
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
