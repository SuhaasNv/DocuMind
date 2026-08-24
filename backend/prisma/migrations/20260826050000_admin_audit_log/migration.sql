-- Admin operation audit trail. Append-only by design: rows are written by
-- the backend on every mutating admin action; there are no mutating API
-- routes for audit entries. No FK to users so the trail survives admin
-- account deletion.
CREATE TABLE "admin_audit_log" (
    "id" TEXT NOT NULL,
    "admin_user_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_log_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "admin_audit_log_created_at_idx" ON "admin_audit_log"("created_at");
