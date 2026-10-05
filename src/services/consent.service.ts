import { supabaseAdmin } from "../config/supabase.js";

export interface ConsentRequest {
  id: string;
  userId: string;
  userEmail: string;
  documentId: string;
  documentTitle: string;
  requestedFields: string[];
  verifierName: string;
  reason?: string;
  status: "pending" | "approved" | "rejected" | "expired";
  createdAt: string;
  expiresAt: string;
  disclosedData?: Record<string, unknown>;
  verificationToken?: string;
}

const consentStore = new Map<string, ConsentRequest>();

export const ConsentService = {
  createRequest: async (params: {
    userId: string;
    userEmail: string;
    documentId: string;
    documentTitle: string;
    requestedFields: string[];
    verifierName: string;
    reason?: string;
    expiresInMinutes?: number;
  }): Promise<ConsentRequest> => {
    const id = `req_${Math.random().toString(36).substring(2, 10)}`;
    const now = new Date();
    const expiry = new Date(now.getTime() + (params.expiresInMinutes || 10) * 60 * 1000);

    const newReq: ConsentRequest = {
      id,
      userId: params.userId,
      userEmail: params.userEmail,
      documentId: params.documentId,
      documentTitle: params.documentTitle,
      requestedFields: params.requestedFields,
      verifierName: params.verifierName,
      reason: params.reason || "Verification of certificate credentials",
      status: "pending",
      createdAt: now.toISOString(),
      expiresAt: expiry.toISOString(),
    };

    // 1. Persist to Supabase
    try {
      await supabaseAdmin.from("consent_requests").insert({
        id,
        user_id: params.userId,
        document_id: params.documentId !== "doc-default" ? params.documentId : null,
        requested_fields: params.requestedFields,
        verifier_name: params.verifierName,
        reason: newReq.reason,
        status: "pending",
        created_at: newReq.createdAt,
        expires_at: newReq.expiresAt,
      });
    } catch (e) {
      console.error("[ConsentService.createRequest] Supabase error:", e);
    }

    consentStore.set(id, newReq);
    return newReq;
  },

  getPendingRequestsForUser: async (userId: string): Promise<ConsentRequest[]> => {
    try {
      const now = new Date().toISOString();
      const { data, error } = await supabaseAdmin
        .from("consent_requests")
        .select("*, documents(title)")
        .eq("user_id", userId)
        .eq("status", "pending")
        .gt("expires_at", now);

      if (!error && data) {
        return data.map((d: any) => ({
          id: d.id,
          userId: d.user_id,
          userEmail: "",
          documentId: d.document_id,
          documentTitle: d.documents?.title || "Official Certificate",
          requestedFields: Array.isArray(d.requested_fields) ? d.requested_fields : [],
          verifierName: d.verifier_name,
          reason: d.reason,
          status: d.status,
          createdAt: d.created_at,
          expiresAt: d.expires_at,
          disclosedData: d.disclosed_data,
          verificationToken: d.verification_token,
        }));
      }
    } catch (e) {
      console.error("[ConsentService.getPendingRequestsForUser] Supabase error:", e);
    }

    // Fallback to memory
    const list: ConsentRequest[] = [];
    const now = new Date();
    for (const req of consentStore.values()) {
      if (req.userId === userId && req.status === "pending") {
        if (new Date(req.expiresAt) < now) {
          req.status = "expired";
        } else {
          list.push(req);
        }
      }
    }
    return list;
  },

  getConsentRequest: async (requestId: string): Promise<ConsentRequest | null> => {
    try {
      const { data, error } = await supabaseAdmin
        .from("consent_requests")
        .select("*, documents(title)")
        .eq("id", requestId)
        .single();

      if (!error && data) {
        return {
          id: data.id,
          userId: data.user_id,
          userEmail: "",
          documentId: data.document_id,
          documentTitle: data.documents?.title || "Official Certificate",
          requestedFields: Array.isArray(data.requested_fields) ? data.requested_fields : [],
          verifierName: data.verifier_name,
          reason: data.reason,
          status: data.status,
          createdAt: data.created_at,
          expiresAt: data.expires_at,
          disclosedData: data.disclosed_data,
          verificationToken: data.verification_token,
        };
      }
    } catch (_) {}

    return consentStore.get(requestId) || null;
  },

  respondToRequest: async (params: {
    userId: string;
    requestId: string;
    action: "approve" | "reject";
    disclosedData?: Record<string, unknown>;
    verificationToken?: string;
  }): Promise<ConsentRequest | null> => {
    const status = params.action === "approve" ? "approved" : "rejected";

    try {
      const { data, error } = await supabaseAdmin
        .from("consent_requests")
        .update({
          status,
          disclosed_data: params.disclosedData || null,
          verification_token: params.verificationToken || null,
        })
        .eq("id", params.requestId)
        .eq("user_id", params.userId)
        .select()
        .single();

      if (!error && data) {
        const updated: ConsentRequest = {
          id: data.id,
          userId: data.user_id,
          userEmail: "",
          documentId: data.document_id,
          documentTitle: "Official Certificate",
          requestedFields: Array.isArray(data.requested_fields) ? data.requested_fields : [],
          verifierName: data.verifier_name,
          reason: data.reason,
          status: data.status,
          createdAt: data.created_at,
          expiresAt: data.expires_at,
          disclosedData: data.disclosed_data,
          verificationToken: data.verification_token,
        };
        consentStore.set(updated.id, updated);
        return updated;
      }
    } catch (e) {
      console.error("[ConsentService.respondToRequest] Supabase error:", e);
    }

    const req = consentStore.get(params.requestId);
    if (!req || req.userId !== params.userId) return null;

    req.status = status;
    req.disclosedData = params.disclosedData;
    req.verificationToken = params.verificationToken;
    return req;
  },
};
