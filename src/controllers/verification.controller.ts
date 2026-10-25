import crypto from "crypto";
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

  // Merge client-supplied document data if sent in request body
  if (req.body && (req.body.document_data || req.body.data)) {
    parsedData = { ...parsedData, ...(req.body.document_data || req.body.data) };
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
  const { status, notes, decision, institution_name, institution_type } = req.body as {
    status: "verified" | "pending" | "rejected";
    decision?: "genuine" | "fraudulent";
    institution_name?: string;
    institution_type?: string;
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

  const isGenuine = decision !== "fraudulent" && status === "verified";
  const finalStatus = isGenuine ? "verified" : (decision === "fraudulent" ? "rejected" : status);
  const typeTag = (institution_type || doc.category || "ORG").slice(0, 4).toUpperCase();
  const randomSuffix = crypto.randomBytes(3).toString("hex").toUpperCase();
  const sealId = isGenuine ? `VDA-${typeTag}-${randomSuffix}` : `VDA-FORGED-${randomSuffix}`;

  const verificationSeal = {
    seal_id: sealId,
    is_genuine: isGenuine,
    status: finalStatus,
    verifier_id: verifierId,
    verifier_name: institution_name || "Authorized Institution",
    institution_type: institution_type || doc.category || "institution",
    verified_at: new Date().toISOString(),
    notes: notes || (isGenuine ? "Officially verified and sealed" : "Flagged as not genuine by issuing institution"),
  };

  // Attempt update with verification_seal column, with graceful fallback if column not yet migrated
  let updatedDoc: any = null;
  const { data: fullUpdate, error: fullUpdateErr } = await supabaseAdmin
    .from("documents")
    .update({
      status: finalStatus,
      verification_seal: verificationSeal,
    })
    .eq("id", docId)
    .select()
    .single();

  if (!fullUpdateErr && fullUpdate) {
    updatedDoc = fullUpdate;
  } else {
    // Fallback if column does not exist yet in schema
    const { data: basicUpdate, error: basicErr } = await supabaseAdmin
      .from("documents")
      .update({ status: finalStatus })
      .eq("id", docId)
      .select()
      .single();

    if (basicErr) {
      res.status(500).json({ error: `Failed to update status: ${basicErr.message}` });
      return;
    }
    updatedDoc = { ...basicUpdate, verification_seal: verificationSeal };
  }

  // Record verifier action in verification_logs
  const logStatus = isGenuine ? "success" : "failed";
  await supabaseAdmin.from("verification_logs").insert({
    document_id: docId,
    verifier_id: verifierId,
    status: logStatus,
  });

  // Send automated Smart Notification to document owner
  await supabaseAdmin.from("notifications").insert({
    user_id: doc.owner_id,
    document_id: doc.id,
    type: isGenuine ? "verification_status" : "document_expired",
    title: isGenuine
      ? `${doc.title} Verified by ${verificationSeal.verifier_name}`
      : `Security Alert: ${doc.title} Flagged as Not Genuine`,
    message: isGenuine
      ? `Your credential '${doc.title}' has been officially verified by ${verificationSeal.verifier_name}. Digital Seal: #${sealId}.`
      : `Your credential '${doc.title}' was examined by ${verificationSeal.verifier_name} and flagged as counterfeit. Reason: ${verificationSeal.notes}.`,
    severity: isGenuine ? "info" : "critical",
    status: "unread",
    metadata: {
      milestone: isGenuine ? "verified" : "forged",
      document_title: doc.title,
      seal_id: sealId,
      verifier_name: verificationSeal.verifier_name,
    },
  });

  res.json({
    message: isGenuine ? `Document verified and sealed (#${sealId})` : `Document flagged as not genuine (#${sealId})`,
    document: updatedDoc,
    verification_seal: verificationSeal,
  });
};
