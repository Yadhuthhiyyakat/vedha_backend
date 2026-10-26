import crypto from "crypto";
import { Response, Request } from "express";
import { AuthenticatedRequest } from "../middleware/auth.middleware.js";
import { supabaseAdmin } from "../config/supabase.js";
import { decryptData } from "../services/encryption.service.js";

// Standard institutional partners for instant verification selection
const DEFAULT_INSTITUTIONS = [
  { id: "inst-nitc", name: "NIT Calicut", type: "university", verified: true },
  { id: "inst-apollo", name: "Apollo Hospitals", type: "hospital", verified: true },
  { id: "inst-aiims", name: "AIIMS New Delhi", type: "hospital", verified: true },
  { id: "inst-iitb", name: "IIT Bombay", type: "university", verified: true },
  { id: "inst-manipal", name: "Manipal Hospital", type: "hospital", verified: true },
  { id: "inst-uidai", name: "UIDAI National Registry", type: "government", verified: true },
];

// ─── GET /api/institutions ────────────────────────────────────────────────────
// Returns list of registered/active institutions for citizens to submit documents to
export const listInstitutions = async (
  _req: Request,
  res: Response
): Promise<void> => {
  try {
    // 1. Check official institutions registry table if created
    let officialList: any[] = [];
    try {
      const { data: registry, error: regErr } = await supabaseAdmin
        .from("institutions")
        .select("id, name, type, domain")
        .eq("is_active", true);
      if (!regErr && registry && registry.length > 0) {
        officialList = registry.map((r: any) => ({
          id: r.id,
          name: r.name,
          type: r.type || "university",
          domain: r.domain,
          verified: true,
        }));
      }
    } catch (_) {}

    // 2. Query registered institution user accounts from profiles
    const { data: dbInstitutions } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, institution_name, institution_type, avatar_url")
      .eq("role", "institution");

    const dynamicList = (dbInstitutions || []).map((inst: any) => ({
      id: inst.id,
      name: inst.institution_name || inst.full_name || "Authorized Institution",
      type: inst.institution_type || "institution",
      avatar_url: inst.avatar_url,
      verified: true,
    }));

    // Merge: registry institutions + profile institutions + DEFAULT_INSTITUTIONS
    const existingNames = new Set<string>();
    const merged: any[] = [];

    for (const item of [...officialList, ...dynamicList, ...DEFAULT_INSTITUTIONS]) {
      const lower = item.name.toLowerCase().trim();
      if (!existingNames.has(lower)) {
        existingNames.add(lower);
        merged.push(item);
      }
    }

    res.json({ count: merged.length, institutions: merged });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// ─── POST /api/documents/:docId/submit-verification ───────────────────────────
// Citizen submits an owned document to a target institution for official verification
export const submitDocumentForVerification = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const userId = req.user!.id;
  const { docId } = req.params as { docId: string };
  const { target_institution, applicant_notes } = req.body as {
    target_institution: string;
    applicant_notes?: string;
  };

  if (!target_institution || target_institution.trim().length === 0) {
    res.status(400).json({ error: "target_institution is required" });
    return;
  }

  // Verify ownership
  const { data: doc, error: docErr } = await supabaseAdmin
    .from("documents")
    .select("id, owner_id, title, category, subcategory, status")
    .eq("id", docId)
    .eq("owner_id", userId)
    .single();

  if (docErr || !doc) {
    res.status(404).json({ error: "Document not found or access denied" });
    return;
  }

  // Update submission status
  const { data: updatedDoc, error: updateErr } = await supabaseAdmin
    .from("documents")
    .update({
      target_institution: target_institution.trim(),
      submission_status: "submitted",
      applicant_notes: applicant_notes?.trim() || null,
      status: "pending",
    })
    .eq("id", docId)
    .select()
    .single();

  if (updateErr) {
    res.status(500).json({ error: `Failed to submit document: ${updateErr.message}` });
    return;
  }

  // Notify any registered institution matching target_institution
  try {
    const { data: instProfiles } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("role", "institution")
      .ilike("institution_name", `%${target_institution.trim()}%`);

    if (instProfiles && instProfiles.length > 0) {
      for (const inst of instProfiles) {
        await supabaseAdmin.from("notifications").insert({
          user_id: inst.id,
          document_id: doc.id,
          type: "general",
          title: `New Verification Request: ${doc.title}`,
          message: `A citizen submitted '${doc.title}' to ${target_institution} for verification.`,
          severity: "info",
          status: "unread",
          metadata: {
            applicant_notes: applicant_notes || null,
            document_title: doc.title,
          },
        });
      }
    }
  } catch (_) {
    // Notification failure should not block submission
  }

  // Generate immediate Institutional Verification QR Token (valid for 24 hours)
  const qrToken = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  await supabaseAdmin.from("verification_tokens").insert({
    document_id: doc.id,
    token: qrToken,
    expires_at: expiresAt,
    shared_fields: ["title", "category", "subcategory", "status", "expiry_date", "document_data", "file"],
  });

  res.json({
    message: `Document submitted to ${target_institution.trim()} for verification.`,
    document: updatedDoc,
    token: qrToken,
    qr_token: qrToken,
    expires_at: expiresAt,
  });
};

// ─── GET /api/institutions/queue ──────────────────────────────────────────────
// Institution endpoint: returns documents submitted for verification
export const getInstitutionQueue = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const userId = req.user!.id;

  // Retrieve institution profile
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("role, institution_name, institution_type, full_name")
    .eq("id", userId)
    .single();

  const isInstOrAdmin =
    profile?.role === "institution" ||
    profile?.role === "admin" ||
    req.user?.role === "admin";

  if (!isInstOrAdmin) {
    res.status(403).json({ error: "Access denied. Only institution accounts can access the verification queue." });
    return;
  }

  const instName = profile?.institution_name?.trim();

  // Query documents submitted for review
  let query = supabaseAdmin
    .from("documents")
    .select("*, profiles:owner_id(full_name, avatar_url, username)")
    .order("created_at", { ascending: false });

  // If specific institution name is set, filter by that institution; otherwise show all submitted
  if (instName && profile?.role !== "admin") {
    query = query.ilike("target_institution", `%${instName}%`);
  }

  const { data: docs, error } = await query;

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  // Decrypt and sanitize document items for review
  const items = (docs || []).map((doc: any) => {
    let innerData: Record<string, any> = {};
    if (doc.document_data) {
      try {
        const plaintext = decryptData(doc.document_data);
        innerData = JSON.parse(plaintext);
      } catch {
        if (typeof doc.document_data === "object") {
          innerData = doc.document_data;
        }
      }
    }

    const ownerProfile = doc.profiles || {};

    return {
      id: doc.id,
      title: doc.title,
      type: doc.type,
      category: doc.category,
      subcategory: doc.subcategory,
      status: doc.status,
      submission_status: doc.submission_status,
      target_institution: doc.target_institution,
      applicant_notes: doc.applicant_notes,
      verification_seal: doc.verification_seal,
      created_at: doc.created_at,
      expiry_date: doc.expiry_date,
      owner_name: ownerProfile.full_name || ownerProfile.username || "Citizen",
      owner_avatar: ownerProfile.avatar_url,
      document_data: innerData,
      has_file: !!innerData.file_path || !!doc.file_url,
    };
  });

  res.json({
    institution: instName || "Institutional Verifier",
    count: items.length,
    documents: items,
  });
};

// ─── PATCH /api/profiles/role ────────────────────────────────────────────────
// Allows users to set or switch their role (e.g. Register as an Institution)
export const updateMyRole = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const userId = req.user!.id;
  const { role, institution_name, institution_type } = req.body as {
    role: "citizen" | "institution" | "admin";
    institution_name?: string;
    institution_type?: string;
  };

  if (!["citizen", "institution", "admin"].includes(role)) {
    res.status(400).json({ error: "Invalid role. Must be 'citizen' or 'institution'." });
    return;
  }

  const updatePayload: Record<string, any> = {
    role,
    institution_name: role === "institution" ? (institution_name?.trim() || "Authorized Institution") : null,
    institution_type: role === "institution" ? (institution_type?.trim() || "university") : null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .update(updatePayload)
    .eq("id", userId)
    .select()
    .single();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json({
    message: `Account role updated to '${role}'`,
    profile: data,
  });
};
