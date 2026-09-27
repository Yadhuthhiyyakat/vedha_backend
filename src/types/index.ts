// ─── Shared types matching the Supabase schema ────────────────────────────────

export interface Profile {
  id: string;
  updated_at: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
}

export interface Document {
  id: string;
  owner_id: string;
  title: string;
  type: string;
  category?: string;
  subcategory?: string;
  /** Encrypted AES-256-GCM blob string (or JSON object) stored in document_data column. Use GET /decrypt to retrieve decrypted data. */
  document_data?: string | Record<string, unknown> | null;
  status: "verified" | "pending" | "rejected";
  expiry_date?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  document_id: string | null;
  type: "expiry_warning" | "document_expired" | "verification_status" | "general";
  title: string;
  message: string;
  severity: "info" | "warning" | "critical";
  status: "unread" | "read" | "archived";
  read_at: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface VerificationToken {
  id: string;
  document_id: string;
  token: string;
  expires_at: string;
  created_at: string;
  shared_fields: string[] | null;
}

export interface VerificationLog {
  id: string;
  document_id: string | null;
  verifier_id: string | null;
  status: "success" | "failed";
  created_at: string;
}
