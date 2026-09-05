/**
 * Retrieval eval: hybrid (dense+lexical RRF) retrieval quality, scored
 * deterministically — no LLM judge, no token cost. Free to run on every PR.
 *
 * Usage: npx ts-node --transpile-only eval/run-retrieval-eval.ts [baseUrl]
 * Requires a locally running backend + Postgres (pgvector) + Redis, same as
 * scripts/smoke.ts. Exits non-zero if recall@k drops below RECALL_THRESHOLD.
 */
import 'dotenv/config'; // loads backend/.env — same DATABASE_URL used to persist the run
import { retrievalCases } from './cases/retrieval.cases';
import { setupEvalSession } from './lib/setup-fixtures';
import {
  firstMatchRank,
  recallAtK,
  meanReciprocalRank,
  type RetrievalCaseResult,
} from './lib/metrics';
import { persistEvalRun } from './lib/persist-run';

const BASE = process.argv[2] ?? 'http://localhost:3000';
/** Minimum acceptable recall@k across all cases before the run fails CI. */
const RECALL_THRESHOLD = 0.8;

async function main(): Promise<void> {
  const startedAt = new Date();
  const fixtures = [
    ...new Map(retrievalCases.map((c) => [c.fixture.name, c.fixture])).values(),
  ];
  console.log(
    `Uploading ${fixtures.length} fixture(s) and waiting for ingestion...`,
  );
  const session = await setupEvalSession(BASE, fixtures);

  const results: RetrievalCaseResult[] = [];
  console.log('\ncase                        rank  found');
  console.log('--------------------------- ----- -----');
  for (const c of retrievalCases) {
    const documentId = session.documentIds.get(c.fixture.name);
    if (!documentId)
      throw new Error(`No uploaded document for fixture ${c.fixture.name}`);
    const chunks = await session.client.retrieve(
      session.token,
      documentId,
      c.query,
      c.topK,
    );
    const rank = firstMatchRank(chunks, c.expectedSubstring);
    results.push({ id: c.id, found: rank !== null, rank });
    console.log(
      `${c.id.padEnd(27)} ${String(rank ?? '-').padEnd(5)} ${rank !== null ? 'yes' : 'NO'}`,
    );
  }

  const recall = recallAtK(results);
  const mrr = meanReciprocalRank(results);
  console.log(
    `\nrecall@k: ${(recall * 100).toFixed(1)}%  (threshold ${(RECALL_THRESHOLD * 100).toFixed(0)}%)`,
  );
  console.log(`MRR:      ${mrr.toFixed(3)}`);

  const failed = results.filter((r) => !r.found);
  if (failed.length > 0) {
    console.log(`\nFAILED cases: ${failed.map((f) => f.id).join(', ')}`);
  }

  const passed = recall >= RECALL_THRESHOLD;
  await persistEvalRun({
    kind: 'RETRIEVAL',
    passed,
    baseUrl: BASE,
    startedAt,
    finishedAt: new Date(),
    summary: {
      recall,
      mrr,
      threshold: RECALL_THRESHOLD,
      caseCount: results.length,
    },
    cases: results,
  });

  if (!passed) {
    console.error(
      `\nRetrieval eval FAILED: recall@k ${recall.toFixed(3)} below threshold ${RECALL_THRESHOLD}`,
    );
    process.exit(1);
  }
  console.log('\nRetrieval eval PASSED.');
}

main().catch((err) => {
  console.error('Retrieval eval crashed:', err);
  process.exit(1);
});
