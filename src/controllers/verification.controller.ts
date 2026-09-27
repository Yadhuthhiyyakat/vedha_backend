import { Response } from "express";
import { AuthenticatedRequest } from "../middleware/auth.middleware.js";
import { supabaseAdmin } from "../config/supabase.js";
import { decryptData } from "../services/encryption.service.js";
import { verifyDocumentData } from "../services/algorithmicVerification.service.js";

// ─── POST /api/documents/:docId/verify ───────────────────────────────────────
// Automated verification: tests algorithmic checksums and formats against document data
export const autoVerifyDocument = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const userId = req.user!.id;
  const { docId } = req.params as { docId: string };

  // Fetch document (owner only)
  const { data: doc, error: docErr } = await supabaseAdmin
    .from("documents")
    .select("id, owner_id, title, category, subcategory, document_data, status")
    .eq("id", docId)
    .eq("owner_id", userId)
    .single();

  if (docErr || !doc) {
    res.status(404).json({ error: "Document not found or access denied" });
    return;
  }

  // Decrypt document_data if stored encrypted
  let parsedData: Record<string, unknown> = {};
  if (doc.document_data) {
    try {
      const plaintext = decryptData(doc.document_data);
      parsedData = JSON.parse(plaintext);
    } catch {
      if (typeof doc.document_data === "object") {
        parsedData = doc.document_data as Record<string, unknown>;
      }
    }
  }

  // Fetch user profile name to cross-check surname / initials
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("full_name")
    .eq("id", userId)
    .single();

  const userFullName = profile?.full_name ?? undefined;

  // Run algorithmic verification
  const result = verifyDocumentData(
    doc.category ?? "other",
    doc.subcategory ?? "other",
    parsedData,
    userFullName
  );

  const newStatus = result.verified ? "verified" : "rejected";

  // Update status in documents table
  const { error: updateErr } = await supabaseAdmin
    .from("documents")
    .update({ status: newStatus })
    .eq("id", docId);

  if (updateErr) {
    res.status(500).json({ error: `Failed to update document status: ${updateErr.message}` });
    return;
  }

  // Write audit trail log in verification_logs
  await supabaseAdmin.from("verification_logs").insert({
    document_id: docId,
    verifier_id: null, // Automated system verifier
    status: result.verified ? "success" : "failed",
  });

  if (!result.verified) {
    res.status(422).json({
      message: "Algorithmic verification failed",
      status: "rejected",
      verified: false,
      errors: result.errors,
      details: result.details,
    });
    return;
  }

  res.json({
    message: "Document successfully verified",
    status: "verified",
    verified: true,
    checks_passed: result.checksPassed,
    details: result.details,
  });
};

// ─── PATCH /api/documents/:docId/status ──────────────────────────────────────
// Institutional / Verifier / Admin endpoint: manually verify or reject documents (e.g. degrees, hospital records)
export const updateDocumentStatus = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const verifierId = req.user!.id;
  const { docId } = req.params as { docId: string };
  const { status, notes } = req.body as {
    status: "verified" | "pending" | "rejected";
    notes?: string;
  };

  // Check that the document exists
  const { data: doc, error: docErr } = await supabaseAdmin
    .from("documents")
    .select("id, owner_id, title, category, subcategory, status")
    .eq("id", docId)
    .single();

  if (docErr || !doc) {
    res.status(404).json({ error: "Document not found" });
    return;
  }

  // Update document status
  const { data: updatedDoc, error: updateErr } = await supabaseAdmin
    .from("documents")
    .update({ status })
    .eq("id", docId)
    .select("id, title, category, subcategory, status, created_at")
    .single();

  if (updateErr) {
    res.status(500).json({ error: `Failed to update status: ${updateErr.message}` });
    return;
  }

  // Record verifier action in verification_logs
  const logStatus = status === "verified" ? "success" : status === "rejected" ? "failed" : "pending";
  await supabaseAdmin.from("verification_logs").insert({
    document_id: docId,
    verifier_id: verifierId,
    status: logStatus,
  });

  res.json({
    message: `Document status updated to '${status}'`,
    document: updatedDoc,
    notes: notes ?? null,
  });
};
