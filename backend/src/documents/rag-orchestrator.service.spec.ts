import { buildRagDebug } from './rag-orchestrator.service.js';

const baseArgs = {
  documentId: 'doc-1',
  cacheStatus: 'miss' as const,
  timings: {
    embedMs: 12.34,
    retrievalMs: 56.78,
    promptBuildMs: 1.11,
    totalMs: 999.99,
  },
  topK: 4,
  historyTurns: 2,
};

describe('buildRagDebug (debug gating + assembly)', () => {
  it('returns undefined when the debug flag is off or absent', () => {
    expect(buildRagDebug({ ...baseArgs, debug: false })).toBeUndefined();
    expect(buildRagDebug({ ...baseArgs, debug: undefined })).toBeUndefined();
  });

  it('builds the payload when debug is on (rounded timings, topK, historyTurns)', () => {
    const out = buildRagDebug({ ...baseArgs, debug: true });
    expect(out).toEqual({
      cacheStatus: 'miss',
      timings: {
        embedMs: 12.3,
        retrievalMs: 56.8,
        promptBuildMs: 1.1,
        totalMs: 1000,
      },
      candidates: [],
      topK: 4,
      historyTurns: 2,
    });
    expect(out).not.toHaveProperty('semanticSimilarity');
  });

  it('flags included candidates (retained + in prompt) and stamps their marker', () => {
    const out = buildRagDebug({
      ...baseArgs,
      debug: true,
      candidates: [
        { chunkIndex: 3, denseScore: 0.9, rrfScore: 0.03, retained: true },
        { chunkIndex: 5, lexicalScore: 0.02, rrfScore: 0.02, retained: true },
        { chunkIndex: 9, denseScore: 0.4, rrfScore: 0.01, retained: false },
      ],
      includedChunkIndices: [3, 9], // 9 was trimmed pre-topK, must stay excluded
    });
    expect(out?.candidates).toEqual([
      {
        chunkIndex: 3,
        documentId: 'doc-1',
        denseScore: 0.9,
        rrfScore: 0.03,
        retained: true,
        included: true,
        marker: '[Chunk 3]',
      },
      {
        chunkIndex: 5,
        documentId: 'doc-1',
        lexicalScore: 0.02,
        rrfScore: 0.02,
        retained: true,
        included: false,
      },
      {
        chunkIndex: 9,
        documentId: 'doc-1',
        denseScore: 0.4,
        rrfScore: 0.01,
        retained: false,
        included: false,
      },
    ]);
  });

  it('carries semanticSimilarity and optional llmFirstTokenMs when present', () => {
    const out = buildRagDebug({
      ...baseArgs,
      debug: true,
      cacheStatus: 'semantic',
      semanticSimilarity: 0.97,
      timings: { ...baseArgs.timings, llmFirstTokenMs: 250.06 },
    });
    expect(out?.cacheStatus).toBe('semantic');
    expect(out?.semanticSimilarity).toBe(0.97);
    expect(out?.timings.llmFirstTokenMs).toBe(250.1);
  });
});
