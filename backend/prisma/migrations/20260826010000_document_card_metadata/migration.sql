-- Document card metadata (Phase 13b): processing stage, safe failure reason,
-- page/chunk counts. summary/suggested_questions are populated by the Phase 8
-- pipeline; added here with IF NOT EXISTS so either phase can land first.
ALTER TABLE "documents"
  ADD COLUMN IF NOT EXISTS "page_count" INTEGER,
  ADD COLUMN IF NOT EXISTS "chunk_count" INTEGER,
  ADD COLUMN IF NOT EXISTS "stage" TEXT,
  ADD COLUMN IF NOT EXISTS "failure_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "summary" TEXT,
  ADD COLUMN IF NOT EXISTS "suggested_questions" JSONB;
