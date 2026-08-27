-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Add document encryption columns
-- Run this in: Supabase Dashboard → SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add encrypted storage column
--    Stores the JSON-serialised EncryptedBlob { v, iv, tag, data }
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS encrypted_data TEXT DEFAULT NULL;

-- 2. Flag so the API knows whether to offer a /decrypt endpoint for this row
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS is_encrypted BOOLEAN NOT NULL DEFAULT FALSE;

-- 3. Track which key version was used — needed for future key rotation
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS encryption_key_version INT DEFAULT NULL;

-- 4. Null out the old plain-text column for all future rows
--    (existing rows are left intact for safety — clear manually once confirmed)
-- ALTER TABLE documents ALTER COLUMN document_data SET DEFAULT NULL;

-- 5. Optional index: fast lookup of encrypted docs (e.g. for bulk re-encryption)
CREATE INDEX IF NOT EXISTS idx_documents_is_encrypted
  ON documents (is_encrypted)
  WHERE is_encrypted = TRUE;

-- ─── Verification ─────────────────────────────────────────────────────────────
-- Run this after the migration to confirm the columns exist:
--
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'documents'
--   AND column_name IN ('encrypted_data', 'is_encrypted', 'encryption_key_version');
