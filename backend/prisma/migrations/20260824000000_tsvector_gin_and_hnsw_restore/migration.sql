-- Restore the HNSW vector index that 20260130144147_schema_sync dropped.
-- Without it every dense retrieval is a sequential scan.
CREATE INDEX IF NOT EXISTS "document_chunks_embedding_idx"
  ON "document_chunks" USING hnsw (embedding vector_cosine_ops);

-- Full-text lexical retrieval: generated tsvector column + GIN index.
-- Replaces the unindexed leading-wildcard ILIKE scan.
ALTER TABLE "document_chunks"
  ADD COLUMN IF NOT EXISTS "content_tsv" tsvector
  GENERATED ALWAYS AS (to_tsvector('english', "content")) STORED;

CREATE INDEX IF NOT EXISTS "document_chunks_content_tsv_idx"
  ON "document_chunks" USING GIN ("content_tsv");
