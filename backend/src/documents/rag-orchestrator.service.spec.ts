import { buildRagDebug } from './rag-orchestrator.service.js';

const baseArgs = {
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

  it('assigns numeric markers by prompt-inclusion order (includedPositions)', () => {
    // Candidate pool is RRF-desc sorted; the first `retained` entries are the
    // retrieval results, and includedPositions index into that results array.
    const out = buildRagDebug({
      ...baseArgs,
      debug: true,
      candidates: [
        {
          chunkIndex: 3,
          documentId: 'doc-1',
          denseScore: 0.9,
          rrfScore: 0.03,
          retained: true,
        },
        {
          chunkIndex: 5,
          documentId: 'doc-1',
          lexicalScore: 0.02,
          rrfScore: 0.02,
          retained: true,
        },
        {
          chunkIndex: 9,
          documentId: 'doc-1',
          denseScore: 0.4,
          rrfScore: 0.01,
          retained: false,
        },
      ],
      // Prompt included result 1 first, then result 0 → markers 1 and 2.
      includedPositions: [1, 0],
    });
    expect(out?.candidates).toEqual([
      {
        chunkIndex: 3,
        documentId: 'doc-1',
        denseScore: 0.9,
        rrfScore: 0.03,
        retained: true,
        included: true,
        marker: 2,
      },
      {
        chunkIndex: 5,
        documentId: 'doc-1',
        lexicalScore: 0.02,
        rrfScore: 0.02,
        retained: true,
        included: true,
        marker: 1,
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

  it('a retained candidate trimmed from the prompt is not included and has no marker', () => {
    const out = buildRagDebug({
      ...baseArgs,
      debug: true,
      candidates: [
        { chunkIndex: 1, documentId: 'doc-1', rrfScore: 0.03, retained: true },
        { chunkIndex: 2, documentId: 'doc-1', rrfScore: 0.02, retained: true },
      ],
      includedPositions: [0], // result 1 was trimmed by the prompt budget
    });
    expect(out?.candidates?.[1]).toEqual({
      chunkIndex: 2,
      documentId: 'doc-1',
      rrfScore: 0.02,
      retained: true,
      included: false,
    });
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
