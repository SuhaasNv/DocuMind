/**
 * Writes eval run results directly to Postgres via PrismaClient — same
 * connection pattern as prisma/seed.ts. Eval scripts are standalone CLI
 * tools (not part of the running Nest app), so this bypasses the HTTP API
 * entirely rather than requiring an authenticated admin write route.
 *
 * Best-effort: a DB write failure logs and is swallowed so a broken DB
 * connection never hides a real eval pass/fail result from CI's exit code.
 */
import { execSync } from 'node:child_process';
import {
  PrismaClient,
  EvalRunKind,
  Prisma,
} from '../../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { getDatabaseUrlOrThrow } from '../../database-url';

export interface PersistRunInput {
  kind: 'RETRIEVAL' | 'ANSWER';
  passed: boolean;
  baseUrl: string;
  startedAt: Date;
  finishedAt: Date;
  /** Aggregate metrics — shape differs by kind; the admin UI renders per kind. */
  summary: Record<string, unknown>;
  /** Per-case results — shape differs by kind. */
  cases: unknown[];
}

function currentGitSha(): string | undefined {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return undefined;
  }
}

export async function persistEvalRun(input: PersistRunInput): Promise<void> {
  let prisma: PrismaClient | undefined;
  try {
    const connectionString = getDatabaseUrlOrThrow('eval-harness');
    const adapter = new PrismaPg({ connectionString });
    prisma = new PrismaClient({ adapter });
    await prisma.evalRun.create({
      data: {
        kind: EvalRunKind[input.kind],
        passed: input.passed,
        baseUrl: input.baseUrl,
        gitSha: currentGitSha(),
        triggeredBy: process.env.CI ? 'ci' : 'local',
        startedAt: input.startedAt,
        finishedAt: input.finishedAt,
        durationMs: input.finishedAt.getTime() - input.startedAt.getTime(),
        summary: input.summary as Prisma.InputJsonValue,
        cases: input.cases as unknown as Prisma.InputJsonValue,
      },
    });
    console.log('Eval run persisted to admin panel (eval_runs).');
  } catch (err) {
    console.warn(
      `Could not persist eval run to DB (admin panel won't show this run): ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    await prisma?.$disconnect();
  }
}
