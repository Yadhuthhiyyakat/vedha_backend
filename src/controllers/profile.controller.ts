import { Response } from "express";
import { AuthenticatedRequest } from "../middleware/auth.middleware.js";
import { supabaseAdmin } from "../config/supabase.js";

// ─── GET /api/profiles/me ─────────────────────────────────────────────────────
export const getMyProfile = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const userId = req.user!.id;

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (error) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }

  res.json(data);
};

// ─── GET /api/profiles/:userId ────────────────────────────────────────────────
export const getProfile = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const { userId } = req.params as { userId: string };

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, username, full_name, avatar_url, updated_at")
    .eq("id", userId)
    .single();

  if (error || !data) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }

  res.json(data);
};

// ─── PATCH /api/profiles/me ───────────────────────────────────────────────────
export const updateMyProfile = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const userId = req.user!.id;
  const { username, full_name, avatar_url } = req.body as {
    username?: string;
    full_name?: string;
    avatar_url?: string;
  };

  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (username !== undefined) updatePayload["username"] = username;
  if (full_name !== undefined) updatePayload["full_name"] = full_name;
  if (avatar_url !== undefined) updatePayload["avatar_url"] = avatar_url;

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .update(updatePayload)
    .eq("id", userId)
    .select()
    .single();

  if (error) {
    // Unique username violation
    if (error.code === "23505") {
      res.status(409).json({ error: "Username already taken" });
      return;
    }
    res.status(400).json({ error: error.message });
    return;
  }

  res.json(data);
};
