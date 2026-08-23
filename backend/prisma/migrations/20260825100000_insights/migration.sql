-- Knowledge Garden: pinned insights.
CREATE TABLE "insights" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "sources" JSONB NOT NULL,
    "document_id" TEXT,
    "document_name" TEXT,
    "collection_id" TEXT,
    "user_note" TEXT,
    "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "insights_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "insights_user_id_idx" ON "insights"("user_id");

ALTER TABLE "insights" ADD CONSTRAINT "insights_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- documentName is denormalized on the insight so the card outlives the document.
ALTER TABLE "insights" ADD CONSTRAINT "insights_document_id_fkey"
    FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Full-text search over question + content + userNote: generated tsvector
-- column + GIN index (same pattern as document_chunks.content_tsv).
ALTER TABLE "insights"
    ADD COLUMN "search_tsv" tsvector
    GENERATED ALWAYS AS (
        to_tsvector('english',
            "question" || ' ' || "content" || ' ' || coalesce("user_note", ''))
    ) STORED;

CREATE INDEX "insights_search_tsv_idx" ON "insights" USING GIN ("search_tsv");
