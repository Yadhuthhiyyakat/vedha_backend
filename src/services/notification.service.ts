import { supabaseAdmin } from "../config/supabase.js";
import { Notification } from "../types/index.js";

export interface ExpiryMilestone {
  milestone: "expired" | "today" | "tomorrow" | "7_days" | "30_days";
  type: "document_expired" | "expiry_warning";
  severity: "info" | "warning" | "critical";
  title: string;
  getMessage: (docTitle: string, subcategory: string, days: number, dateStr: string) => string;
}

/**
 * Categorize days remaining into smart expiry warning milestones.
 */
export function getExpiryMilestone(daysRemaining: number): ExpiryMilestone | null {
  if (daysRemaining < 0) {
    const absDays = Math.abs(daysRemaining);
    return {
      milestone: "expired",
      type: "document_expired",
      severity: "critical",
      title: "Certificate Expired",
      getMessage: (title, _sub, _days, dateStr) =>
        `Your document '${title}' expired ${absDays === 1 ? "yesterday" : `${absDays} days ago`} on ${dateStr}. Please renew or update your certificate.`,
    };
  }

  if (daysRemaining === 0) {
    return {
      milestone: "today",
      type: "expiry_warning",
      severity: "critical",
      title: "Certificate Expires Today",
      getMessage: (title, _sub, _days, dateStr) =>
        `Urgent: Your document '${title}' expires today (${dateStr}). Immediate renewal or action is required.`,
    };
  }

  if (daysRemaining === 1) {
    return {
      milestone: "tomorrow",
      type: "expiry_warning",
      severity: "critical",
      title: "Certificate Expires Tomorrow",
      getMessage: (title, _sub, _days, dateStr) =>
        `Urgent: Your document '${title}' expires tomorrow on ${dateStr}. Please ensure necessary renewals are in progress.`,
    };
  }

  if (daysRemaining <= 7) {
    return {
      milestone: "7_days",
      type: "expiry_warning",
      severity: "warning",
      title: "Certificate Expiring Soon (within 7 days)",
      getMessage: (title, _sub, days, dateStr) =>
        `Action Required: Your document '${title}' will expire in ${days} days on ${dateStr}.`,
    };
  }

  if (daysRemaining <= 30) {
    return {
      milestone: "30_days",
      type: "expiry_warning",
      severity: "info",
      title: "Certificate Expiry Notice (within 30 days)",
      getMessage: (title, _sub, days, dateStr) =>
        `Reminder: Your document '${title}' is scheduled to expire in ${days} days on ${dateStr}.`,
    };
  }

  // Not yet within any notification threshold
  return null;
}

export interface CreateNotificationParams {
  userId: string;
  documentId?: string | null;
  type: "expiry_warning" | "document_expired" | "verification_status" | "general";
  title: string;
  message: string;
  severity?: "info" | "warning" | "critical";
  metadata?: Record<string, unknown>;
}

/**
 * Creates and stores a notification record in the database.
 */
export async function createNotification(params: CreateNotificationParams): Promise<Notification | null> {
  const {
    userId,
    documentId = null,
    type,
    title,
    message,
    severity = "info",
    metadata = {},
  } = params;

  const { data, error } = await supabaseAdmin
    .from("notifications")
    .insert({
      user_id: userId,
      document_id: documentId,
      type,
      title,
      message,
      severity,
      status: "unread",
      metadata,
    })
    .select()
    .single();

  if (error) {
    console.error("[createNotification] Error creating notification:", error);
    return null;
  }

  return data as Notification;
}

/**
 * Scans documents with expiry_date and generates smart notifications for users.
 * Implements deduplication to avoid repetitive alerts within the same milestone window.
 */
export async function checkAndGenerateExpiryNotifications(targetUserId?: string): Promise<{
  checked: number;
  created: number;
  skipped: number;
}> {
  let query = supabaseAdmin
    .from("documents")
    .select("id, owner_id, title, category, subcategory, expiry_date")
    .not("expiry_date", "is", null);

  if (targetUserId) {
    query = query.eq("owner_id", targetUserId);
  }

  const { data: documents, error } = await query;

  if (error || !documents) {
    console.error("[checkAndGenerateExpiryNotifications] Error querying documents:", error);
    return { checked: 0, created: 0, skipped: 0 };
  }

  let createdCount = 0;
  let skippedCount = 0;
  const now = Date.now();

  for (const doc of documents) {
    if (!doc.expiry_date) continue;

    const expiryTime = new Date(doc.expiry_date).getTime();
    // Fractional day difference rounded up
    const daysRemaining = Math.ceil((expiryTime - now) / (1000 * 60 * 60 * 24));
    const milestoneInfo = getExpiryMilestone(daysRemaining);

    if (!milestoneInfo) {
      // Document expiry is > 30 days away, no notification needed yet
      continue;
    }

    const formattedDate = new Date(doc.expiry_date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

    // Smart deduplication: check if notification with this milestone was already sent
    const { data: existing } = await supabaseAdmin
      .from("notifications")
      .select("id, created_at, metadata")
      .eq("document_id", doc.id)
      .eq("type", milestoneInfo.type)
      .contains("metadata", { milestone: milestoneInfo.milestone })
      .order("created_at", { ascending: false })
      .limit(1);

    if (existing && existing.length > 0 && existing[0]?.created_at) {
      const lastCreated = new Date(existing[0].created_at).getTime();
      // For 'expired' or '30_days', do not re-send more than once every 7 days;
      // for urgent ('today', 'tomorrow', '7_days'), do not re-send within 24 hours.
      const cooldownMs = milestoneInfo.milestone === "30_days" || milestoneInfo.milestone === "expired"
        ? 7 * 24 * 60 * 60 * 1000
        : 24 * 60 * 60 * 1000;

      if (now - lastCreated < cooldownMs) {
        skippedCount++;
        continue;
      }
    }

    const message = milestoneInfo.getMessage(
      doc.title,
      doc.subcategory ?? "certificate",
      daysRemaining,
      formattedDate
    );

    const inserted = await createNotification({
      userId: doc.owner_id,
      documentId: doc.id,
      type: milestoneInfo.type,
      title: milestoneInfo.title,
      message,
      severity: milestoneInfo.severity,
      metadata: {
        milestone: milestoneInfo.milestone,
        days_remaining: daysRemaining,
        expiry_date: doc.expiry_date,
        document_title: doc.title,
        subcategory: doc.subcategory,
      },
    });

    if (inserted) {
      createdCount++;
    }
  }

  return {
    checked: documents.length,
    created: createdCount,
    skipped: skippedCount,
  };
}

/**
 * Summarizes a user's certificates by expiration status.
 */
export async function getExpiringDocumentsSummary(userId: string) {
  const { data: documents, error } = await supabaseAdmin
    .from("documents")
    .select("id, title, category, subcategory, expiry_date, status, created_at")
    .eq("owner_id", userId)
    .not("expiry_date", "is", null)
    .order("expiry_date", { ascending: true });

  if (error || !documents) {
    return {
      total_with_expiry: 0,
      expired: [],
      critical_7_days: [],
      warning_30_days: [],
      valid: [],
    };
  }

  const now = Date.now();
  const summary = {
    total_with_expiry: documents.length,
    expired: [] as any[],
    critical_7_days: [] as any[],
    warning_30_days: [] as any[],
    valid: [] as any[],
  };

  for (const doc of documents) {
    const expiryTime = new Date(doc.expiry_date).getTime();
    const daysRemaining = Math.ceil((expiryTime - now) / (1000 * 60 * 60 * 24));
    const docWithDays = { ...doc, days_remaining: daysRemaining };

    if (daysRemaining < 0) {
      summary.expired.push(docWithDays);
    } else if (daysRemaining <= 7) {
      summary.critical_7_days.push(docWithDays);
    } else if (daysRemaining <= 30) {
      summary.warning_30_days.push(docWithDays);
    } else {
      summary.valid.push(docWithDays);
    }
  }

  return summary;
}
