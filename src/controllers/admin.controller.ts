import { Response } from "express";
import { AuthenticatedRequest } from "../middleware/auth.middleware.js";
import { supabaseAdmin } from "../config/supabase.js";

/**
 * GET /api/admin/stats
 * Aggregates high-level platform stats for admin overview
 */
export const getAdminStats = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user!.id;

    // Verify caller is admin
    const { data: callerProfile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .single();

    if (callerProfile?.role !== "admin" && req.user?.role !== "admin") {
      res.status(403).json({ error: "Access denied. Admin privileges required." });
      return;
    }

    const [profilesRes, docsRes] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, role"),
      supabaseAdmin.from("documents").select("id, status, verification_seal"),
    ]);

    const profiles = profilesRes.data || [];
    const docs = docsRes.data || [];

    const stats = {
      total_users: profiles.length,
      total_citizens: profiles.filter((p) => p.role === "citizen" || !p.role).length,
      total_institutions: profiles.filter((p) => p.role === "institution").length,
      total_admins: profiles.filter((p) => p.role === "admin").length,
      total_documents: docs.length,
      verified_documents: docs.filter((d) => d.status === "verified").length,
      flagged_forgeries: docs.filter(
        (d) => d.verification_seal && (d.verification_seal as any).status === "forged"
      ).length,
    };

    res.json({ stats });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * GET /api/admin/users
 * Lists registered users with filters (search, role)
 */
export const listUsers = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user!.id;

    // Verify caller is admin
    const { data: callerProfile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .single();

    if (callerProfile?.role !== "admin" && req.user?.role !== "admin") {
      res.status(403).json({ error: "Access denied. Admin privileges required." });
      return;
    }

    const { search, role } = req.query as { search?: string; role?: string };

    let query = supabaseAdmin
      .from("profiles")
      .select("id, username, full_name, avatar_url, role, institution_name, institution_type, updated_at")
      .order("updated_at", { ascending: false });

    if (role && role !== "all") {
      query = query.eq("role", role);
    }

    const { data: rawUsers, error } = await query;
    if (error) throw error;

    let users = rawUsers || [];

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      users = users.filter((u: any) => {
        const fn = (u.full_name || "").toLowerCase();
        const un = (u.username || "").toLowerCase();
        const iname = (u.institution_name || "").toLowerCase();
        return fn.includes(q) || un.includes(q) || iname.includes(q);
      });
    }

    res.json({ count: users.length, users });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * PATCH /api/admin/users/:userId/role
 * Allows Admin to assign role and institution credentials to any user
 */
export const assignUserRole = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const callerId = req.user!.id;

    // Verify caller is admin
    const { data: callerProfile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", callerId)
      .single();

    if (callerProfile?.role !== "admin" && req.user?.role !== "admin") {
      res.status(403).json({ error: "Access denied. Admin privileges required." });
      return;
    }

    const { userId } = req.params as { userId: string };
    const { role, institution_name, institution_type } = req.body as {
      role: "citizen" | "institution" | "admin";
      institution_name?: string;
      institution_type?: string;
    };

    if (!["citizen", "institution", "admin"].includes(role)) {
      res.status(400).json({ error: "Invalid role specified. Must be 'citizen', 'institution', or 'admin'." });
      return;
    }

    const updatePayload: Record<string, any> = {
      role,
      institution_name:
        role === "institution"
          ? institution_name?.trim() || "Authorized Institution"
          : null,
      institution_type:
        role === "institution"
          ? institution_type?.trim() || "university"
          : null,
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
      message: `User role successfully updated to '${role}'.`,
      profile: data,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};
