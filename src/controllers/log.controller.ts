import { Response } from "express";
import { AuthenticatedRequest } from "../middleware/auth.middleware.js";
import { supabaseAdmin } from "../config/supabase.js";

// ─── GET /api/logs ────────────────────────────────────────────────────────────
// Returns all verification logs for documents owned by the authenticated user
export const getMyLogs = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const userId = req.user!.id;
  const { document_id } = req.query as { document_id?: string };

  // First, get all document IDs owned by this user
  let docQuery = supabaseAdmin
    .from("documents")
    .select("id")
    .eq("owner_id", userId);

  if (document_id) {
    docQuery = docQuery.eq("id", document_id);
  }

  const { data: docs, error: docErr } = await docQuery;

  if (docErr) {
    res.status(500).json({ error: docErr.message });
    return;
  }

  const docIds = (docs ?? []).map((d) => d.id);

  if (docIds.length === 0) {
    res.json([]);
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("verification_logs")
    .select(
      "id, status, created_at, document_id, verifier_id, documents(title, type)"
    )
    .in("document_id", docIds)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json(data);
};
