-- Server-side conversation persistence (Phase 13d).
-- collection_id is a plain column for now; Phase 9 integration point: add
-- FK REFERENCES "collections"("id") ON DELETE SET NULL once collections land.
CREATE TABLE "conversations" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "document_id" TEXT,
  "collection_id" TEXT,
  "title" VARCHAR(200) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "conversations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "conversations_user_id_fkey" FOREIGN KEY ("user_id")
    REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "conversations_document_id_fkey" FOREIGN KEY ("document_id")
    REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "conversations_user_id_updated_at_idx"
  ON "conversations"("user_id", "updated_at");

CREATE TABLE "conversation_messages" (
  "id" TEXT NOT NULL,
  "conversation_id" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "sources" JSONB,
  "truncated" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "conversation_messages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "conversation_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id")
    REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "conversation_messages_conversation_id_idx"
  ON "conversation_messages"("conversation_id");
