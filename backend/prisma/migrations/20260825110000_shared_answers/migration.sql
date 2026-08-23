-- CreateTable
CREATE TABLE "shared_answers" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "message_snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "expires_at" TIMESTAMP(3),

    CONSTRAINT "shared_answers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shared_answers_token_key" ON "shared_answers"("token");

-- CreateIndex
CREATE INDEX "shared_answers_user_id_idx" ON "shared_answers"("user_id");

-- AddForeignKey
ALTER TABLE "shared_answers" ADD CONSTRAINT "shared_answers_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
