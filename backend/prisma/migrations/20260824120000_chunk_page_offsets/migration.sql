-- Page-aware citations: where each chunk lives in the source PDF.
-- Nullable: chunks ingested before this migration have no page data and the
-- UI falls back to page 1 until the document is reprocessed.
ALTER TABLE "document_chunks"
  ADD COLUMN IF NOT EXISTS "page_start" INTEGER,
  ADD COLUMN IF NOT EXISTS "page_end" INTEGER,
  ADD COLUMN IF NOT EXISTS "char_start" INTEGER,
  ADD COLUMN IF NOT EXISTS "char_end" INTEGER;
