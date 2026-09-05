-- Eval harness result trail. Written directly by backend/eval/run-*.ts
-- (standalone scripts, not the running API) once a run finishes; read-only
-- via GET /admin/eval-runs. No FK to users — the harness runs as a script,
-- not as an authenticated admin session.
CREATE TYPE "EvalRunKind" AS ENUM ('RETRIEVAL', 'ANSWER');

CREATE TABLE "eval_runs" (
    "id" TEXT NOT NULL,
    "kind" "EvalRunKind" NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "base_url" TEXT NOT NULL,
    "git_sha" TEXT,
    "triggered_by" TEXT NOT NULL DEFAULT 'local',
    "started_at" TIMESTAMP(3) NOT NULL,
    "finished_at" TIMESTAMP(3) NOT NULL,
    "duration_ms" INTEGER NOT NULL,
    "summary" JSONB NOT NULL,
    "cases" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eval_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "eval_runs_kind_created_at_idx" ON "eval_runs"("kind", "created_at");
