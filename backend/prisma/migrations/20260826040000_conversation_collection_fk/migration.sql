-- Collections exist on this branch (Phase 9): make conversation.collection_id
-- a real FK so deleting a collection detaches its conversations.
ALTER TABLE "conversations"
  ADD CONSTRAINT "conversations_collection_id_fkey" FOREIGN KEY ("collection_id")
    REFERENCES "collections"("id") ON DELETE SET NULL ON UPDATE CASCADE;
