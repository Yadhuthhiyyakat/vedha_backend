import { Request, Response } from "express";
import { AuthenticatedRequest } from "../middleware/auth.middleware.js";
import { ConsentService } from "../services/consent.service.js";
import { supabaseAdmin } from "../config/supabase.js";

export const createConsentRequest = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const {
    user_email,
    document_id,
    requested_fields = [],
    verifier_name = "Third-Party Verifier",
    reason,
    expires_in_minutes = 10,
  } = req.body;

  let targetDoc: any = null;
  if (document_id) {
    const { data } = await supabaseAdmin
      .from("documents")
      .select("id, title, owner_id")
      .eq("id", document_id)
      .single();
    targetDoc = data;
  }

  const userId = targetDoc?.owner_id || req.user!.id;
  const docTitle = targetDoc?.title || "Educational / Identity Certificate";

  const request = await ConsentService.createRequest({
    userId,
    userEmail: user_email || req.user?.email || "user@veda.app",
    documentId: document_id || (targetDoc?.id ?? "doc-default"),
    documentTitle: docTitle,
    requestedFields: Array.isArray(requested_fields) ? requested_fields : ["title", "status"],
    verifierName: verifier_name,
    reason,
    expiresInMinutes: expires_in_minutes,
  });

  res.status(201).json(request);
};

export const getPendingConsentRequests = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const userId = req.user!.id;
  const requests = await ConsentService.getPendingRequestsForUser(userId);
  res.json({ requests, count: requests.length });
};

export const getConsentStatus = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { requestId } = req.params as { requestId: string };
  const request = await ConsentService.getConsentRequest(requestId);
  if (!request) {
    res.status(404).json({ error: "Consent request not found" });
    return;
  }
  res.json(request);
};

export const respondToConsentRequest = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const userId = req.user!.id;
  const { requestId } = req.params as { requestId: string };
  const { action, disclosed_data, verification_token } = req.body as {
    action: "approve" | "reject";
    disclosed_data?: Record<string, unknown>;
    verification_token?: string;
  };

  if (action !== "approve" && action !== "reject") {
    res.status(400).json({ error: "Action must be 'approve' or 'reject'" });
    return;
  }

  const updated = await ConsentService.respondToRequest({
    userId,
    requestId,
    action,
    disclosedData: disclosed_data,
    verificationToken: verification_token,
  });

  if (!updated) {
    res.status(404).json({ error: "Consent request not found or unauthorized" });
    return;
  }

  res.json({
    message: action === "approve" ? "Consent granted via Biometric Verification" : "Consent declined",
    request: updated,
  });
};
