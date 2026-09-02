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
export const createDocumentSchema = z.object({
  title: z.string().min(1, "Title is required"),
  type: z.string().min(1, "Document type is required"),
  category: z.string().optional(),
  subcategory: z.string().optional(),
  document_data: z.record(z.string(), z.unknown()).optional(),
});

export const updateDocumentStatusSchema = z.object({
  status: z.enum(["verified", "pending", "rejected"]),
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
