import { Request, Response } from "express";
import { AuthenticatedRequest } from "../middleware/auth.middleware.js";
import { supabaseAdmin } from "../config/supabase.js";

// ─── POST /api/auth/signup ────────────────────────────────────────────────────
export const signup = async (req: Request, res: Response): Promise<void> => {
  const { email, password, full_name } = req.body as {
    email: string;
    password: string;
    full_name?: string;
  };

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // skip confirmation email in dev; set false for prod
    user_metadata: { full_name: full_name ?? "" },
  });

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }

  res.status(201).json({
    message: "Account created successfully",
    user: {
      id: data.user.id,
      email: data.user.email,
    },
  });
};

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
export const login = async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body as { email: string; password: string };

  // Use the anon client for sign-in (not admin) so Supabase validates credentials
  const { data, error } = await supabaseAdmin.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.session) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const { access_token, refresh_token, expires_in } = data.session;

  res.json({
    access_token,
    refresh_token,
    expires_in,        // seconds until access_token expires (default: 3600)
    token_type: "Bearer",
    user: {
      id: data.user.id,
      email: data.user.email,
      full_name: data.user.user_metadata?.["full_name"] ?? null,
    },
  });
};

// ─── POST /api/auth/refresh ───────────────────────────────────────────────────
// Exchange a refresh_token for a new access_token + rotated refresh_token
export const refresh = async (req: Request, res: Response): Promise<void> => {
  const { refresh_token } = req.body as { refresh_token: string };

  if (!refresh_token) {
    res.status(400).json({ error: "refresh_token is required" });
    return;
  }

  const { data, error } = await supabaseAdmin.auth.refreshSession({
    refresh_token,
  });

  if (error || !data.session) {
    res.status(401).json({ error: "Invalid or expired refresh token" });
    return;
  }

  const { access_token, refresh_token: new_refresh_token, expires_in } =
    data.session;

  // Return the new token pair — client MUST replace the old refresh_token
  res.json({
    access_token,
    refresh_token: new_refresh_token, // rotated: old one is now invalid
    expires_in,
    token_type: "Bearer",
  });
};

// ─── POST /api/auth/logout ────────────────────────────────────────────────────
// Revokes the session server-side so the refresh_token is permanently invalidated
export const logout = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const userId = req.user!.id;

  // Sign out the user from all sessions (or a single one)
  // admin.signOut invalidates the session that issued the JWT
  const { error } = await supabaseAdmin.auth.admin.signOutUser(userId);

  if (error) {
    res.status(500).json({ error: "Logout failed" });
    return;
  }

  res.json({ message: "Logged out successfully" });
};

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────
// Quick "who am I?" using the current access_token
export const me = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const userId = req.user!.id;

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
