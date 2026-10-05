import { DeviceService } from "../services/device.service.js";
import { Request, Response } from "express";
import crypto from "crypto";
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
  const token = req.accessToken;

  if (token) {
    const { error } = await supabaseAdmin.auth.admin.signOut(token);

    if (error) {
      res.status(500).json({ error: "Logout failed" });
      return;
    }
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

// ─── DELETE /api/auth/delete ──────────────────────────────────────────────────
// Deletes the currently authenticated user's account permanently from Supabase Auth
export const deleteAccount = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const userId = req.user!.id;

  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);

  if (error) {
    res.status(500).json({ error: error.message || "Failed to delete user account" });
    return;
  }

  res.json({ message: "Account deleted successfully" });
};

// ─── POST /api/auth/forgot-password ──────────────────────────────────────────
// Sends a password reset OTP / recovery email via Supabase Auth SMTP
export const forgotPassword = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { email } = req.body as { email: string };

  const { error } = await supabaseAdmin.auth.resetPasswordForEmail(email);

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }

  res.json({ message: "Password reset OTP sent to your email" });
};

// ─── POST /api/auth/reset-password ───────────────────────────────────────────
// Verifies the OTP sent to email and updates the password
export const resetPassword = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { email, otp, new_password } = req.body as {
    email: string;
    otp: string;
    new_password: string;
  };

  // Verify recovery OTP
  const { data, error } = await supabaseAdmin.auth.verifyOtp({
    email,
    token: otp,
    type: "recovery",
  });

  if (error || !data.user) {
    res.status(400).json({ error: error?.message || "Invalid or expired OTP" });
    return;
  }

  // Update password for the user
  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
    data.user.id,
    { password: new_password }
  );

  if (updateError) {
    res.status(400).json({ error: updateError.message });
    return;
  }

  res.json({ message: "Password updated successfully" });
};

// ─── Mobile App Device Pairing Store ─────────────────────────────────────────
interface PairingTokenData {
  userId: string;
  email: string;
  expiresAt: number;
}
const pairingTokens = new Map<string, PairingTokenData>();

// ─── POST /api/auth/pair-token ───────────────────────────────────────────────
// Authenticated endpoint: generates a short-lived token to link mobile app
export const generatePairingToken = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const userId = req.user!.id;
  const email = req.user!.email ?? "";

  const pair_token = crypto.randomBytes(24).toString("hex");
  const expiresInSeconds = 600; // 10 minutes
  const expiresAt = Date.now() + expiresInSeconds * 1000;

  pairingTokens.set(pair_token, {
    userId,
    email,
    expiresAt,
  });

  const qr_payload = JSON.stringify({
    app: "veda",
    action: "device_pair",
    pair_token,
    user_id: userId,
    email,
    expires_at: new Date(expiresAt).toISOString(),
  });

  res.status(201).json({
    pair_token,
    expires_in: expiresInSeconds,
    user_id: userId,
    email,
    qr_payload,
  });
};

// ─── POST /api/auth/pair-exchange ────────────────────────────────────────────
// Public endpoint: mobile app exchanges pairing token to connect device
export const exchangePairingToken = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { pair_token, token, device_name, device_id, platform } = req.body as {
    pair_token?: string;
    token?: string;
    device_name?: string;
    device_id?: string;
    platform?: string;
  };
  const actualToken = pair_token || token;

  if (!actualToken || !pairingTokens.has(actualToken)) {
    res.status(400).json({ error: "Invalid or expired pairing token" });
    return;
  }

  const record = pairingTokens.get(actualToken)!;
  if (Date.now() > record.expiresAt) {
    pairingTokens.delete(actualToken);
    res.status(410).json({ error: "Pairing token has expired" });
    return;
  }

  // Consume single-use token
  pairingTokens.delete(actualToken);

  try {
    // Generate genuine session tokens for the paired user
    const link = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: record.email,
    });

    const otp = link.data?.properties?.email_otp;
    if (!otp) {
      res.status(500).json({ error: "Failed to generate session for device pairing" });
      return;
    }

    const { data: sessionData, error: sessionErr } = await supabaseAdmin.auth.verifyOtp({
      email: record.email,
      token: otp,
      type: "magiclink",
    });

    if (sessionErr || !sessionData.session) {
      res.status(500).json({ error: "Failed to establish device session" });
      return;
    }

    const { access_token, refresh_token, expires_in } = sessionData.session;

    const linkedDevice = DeviceService.registerDevice({
      userId: record.userId,
      deviceName: device_name || "Android Mobile Wallet",
      deviceId: device_id,
      platform: platform || "android",
    });

    res.json({
      message: "Device paired successfully",
      access_token,
      accessToken: access_token,
      refresh_token,
      refreshToken: refresh_token,
      expires_in,
      token_type: "Bearer",
      user: {
        id: record.userId,
        email: record.email,
      },
      device: linkedDevice,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to pair device" });
  }
};

