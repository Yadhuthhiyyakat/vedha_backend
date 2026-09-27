import { Response } from "express";
import { AuthenticatedRequest } from "../middleware/auth.middleware.js";
import { supabaseAdmin } from "../config/supabase.js";
import {
  checkAndGenerateExpiryNotifications,
  getExpiringDocumentsSummary,
} from "../services/notification.service.js";

// ─── GET /api/notifications ──────────────────────────────────────────────────
// Returns the list of notifications for the authenticated user
export const getMyNotifications = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const userId = req.user!.id;
  const { status, type, limit = 50 } = req.query as {
    status?: "unread" | "read" | "archived";
    type?: string;
    limit?: string | number;
  };

  const parsedLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);

  let query = supabaseAdmin
    .from("notifications")
    .select("id, user_id, document_id, type, title, message, severity, status, read_at, metadata, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(parsedLimit);

  if (status) {
    query = query.eq("status", status);
  }
  if (type) {
    query = query.eq("type", type);
  }

  const { data: notifications, error } = await query;

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  // Also retrieve unread count for fast UI badge updates
  const { count: unreadCount, error: countErr } = await supabaseAdmin
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "unread");

  res.json({
    unread_count: countErr ? 0 : unreadCount ?? 0,
    count: notifications?.length ?? 0,
    notifications: notifications ?? [],
  });
};

// ─── GET /api/notifications/unread-count ─────────────────────────────────────
export const getUnreadCount = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const userId = req.user!.id;

  const { count, error } = await supabaseAdmin
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "unread");

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json({ unread_count: count ?? 0 });
};

// ─── PATCH /api/notifications/:id/read ───────────────────────────────────────
// Marks a single notification as read
export const markNotificationAsRead = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const userId = req.user!.id;
  const { id } = req.params as { id: string };

  const { data, error } = await supabaseAdmin
    .from("notifications")
    .update({
      status: "read",
      read_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", userId)
    .select()
    .single();

  if (error || !data) {
    res.status(404).json({ error: "Notification not found or access denied" });
    return;
  }

  res.json({
    message: "Notification marked as read",
    notification: data,
  });
};

// ─── PATCH /api/notifications/read-all ───────────────────────────────────────
// Marks all unread notifications for the user as read
export const markAllNotificationsAsRead = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const userId = req.user!.id;

  const { data, error } = await supabaseAdmin
    .from("notifications")
    .update({
      status: "read",
      read_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("status", "unread")
    .select("id");

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json({
    message: "All unread notifications marked as read",
    marked_count: data?.length ?? 0,
  });
};

// ─── DELETE /api/notifications/:id ───────────────────────────────────────────
// Deletes a notification
export const deleteNotification = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const userId = req.user!.id;
  const { id } = req.params as { id: string };

  const { error } = await supabaseAdmin
    .from("notifications")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.status(204).send();
};

// ─── GET /api/notifications/expiring-summary ─────────────────────────────────
// Returns an overview of user's expiring certificates
export const getExpiringSummary = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const userId = req.user!.id;
  const summary = await getExpiringDocumentsSummary(userId);
  res.json(summary);
};

// ─── POST /api/notifications/check-expiry ────────────────────────────────────
// Manually triggers an expiry audit for the user's certificates
export const triggerExpiryCheck = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const userId = req.user!.id;
  const result = await checkAndGenerateExpiryNotifications(userId);
  res.json({
    message: "Certificate expiry check completed",
    ...result,
  });
};
