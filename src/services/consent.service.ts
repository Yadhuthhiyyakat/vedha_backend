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
  createRequest: (params: {
    userId: string;
    userEmail: string;
    documentId: string;
    documentTitle: string;
    requestedFields: string[];
    verifierName: string;
    reason?: string;
    expiresInMinutes?: number;
  }): ConsentRequest => {
    const id = `req_${Math.random().toString(36).substring(2, 10)}`;
    const now = new Date();
    const expiry = new Date(now.getTime() + (params.expiresInMinutes || 10) * 60 * 1000);

    const req: ConsentRequest = {
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

    consentStore.set(id, req);
    return req;
  },

  getPendingRequestsForUser: (userId: string): ConsentRequest[] => {
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

  getConsentRequest: (requestId: string): ConsentRequest | null => {
    return consentStore.get(requestId) || null;
  },

  respondToRequest: (params: {
    userId: string;
    requestId: string;
    action: "approve" | "reject";
    disclosedData?: Record<string, unknown>;
    verificationToken?: string;
  }): ConsentRequest | null => {
    const req = consentStore.get(params.requestId);
    if (!req || req.userId !== params.userId) return null;

    if (req.status !== "pending") return req;

    if (params.action === "approve") {
      req.status = "approved";
      req.disclosedData = params.disclosedData;
      req.verificationToken = params.verificationToken;
    } else {
      req.status = "rejected";
    }

    return req;
  },
};
