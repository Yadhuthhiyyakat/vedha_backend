import { z } from "zod";

// ─── Profile ──────────────────────────────────────────────────────────────────
export const updateProfileSchema = z.object({
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .optional(),
  full_name: z.string().min(1, "Full name cannot be empty").optional(),
  avatar_url: z.string().url("Must be a valid URL").optional(),
});

// ─── Documents ────────────────────────────────────────────────────────────────
const optionalDateSchema = z
  .string()
  .refine((val) => !isNaN(Date.parse(val)), "Invalid date format for expiry_date")
  .nullable()
  .optional();

export const createDocumentSchema = z.object({
  title: z.string().min(1, "Title is required"),
  type: z.string().min(1, "Document type is required"),
  category: z.string().optional(),
  subcategory: z.string().optional(),
  expiry_date: optionalDateSchema,
  document_data: z.record(z.string(), z.unknown()).optional(),
});

export const updateDocumentSchema = z.object({
  title: z.string().min(1, "Title cannot be empty").optional(),
  type: z.string().min(1, "Type cannot be empty").optional(),
  category: z.string().optional(),
  subcategory: z.string().optional(),
  expiry_date: optionalDateSchema,
  document_data: z.record(z.string(), z.unknown()).optional(),
});

export const updateDocumentStatusSchema = z.object({
  status: z.enum(["verified", "pending", "rejected"]),
  notes: z.string().max(500, "Notes cannot exceed 500 characters").optional(),
});

// ─── Notifications ────────────────────────────────────────────────────────────
export const notificationQuerySchema = z.object({
  status: z.enum(["unread", "read", "archived"]).optional(),
  type: z.enum(["expiry_warning", "document_expired", "verification_status", "general"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50).optional(),
});

// ─── Verification Tokens ──────────────────────────────────────────────────────
export const createTokenSchema = z.object({
  document_id: z.string().uuid("Must be a valid document UUID"),
  expires_in_minutes: z
    .number()
    .int()
    .min(1)
    .max(1440) // max 24 hours
    .default(10),
  shared_fields: z.array(z.string()).optional(),
});
