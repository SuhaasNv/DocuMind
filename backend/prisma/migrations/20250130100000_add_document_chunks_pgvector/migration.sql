-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create document_chunks table with vector embedding (dimension configurable; default 1536)
CREATE TABLE "document_chunks" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" vector(1536),
    "chunk_index" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_chunks_pkey" PRIMARY KEY ("id")
);

-- FK to documents (cascade delete when document is deleted)
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_document_id_fkey" 
  FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "document_chunks_document_id_idx" ON "document_chunks"("document_id");

-- HNSW index for similarity search (cosine distance; use vector_cosine_ops)
CREATE INDEX "document_chunks_embedding_idx" ON "document_chunks" 
  USING hnsw ("embedding" vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
