import {
  buildRagDebug,
  RagOrchestratorService,
  type RagStreamEvent,
} from './rag-orchestrator.service.js';
import type { RetrievalService } from './retrieval.service.js';
import type { PromptService } from '../rag/prompt.service.js';
import type { LlmService } from '../rag/llm.service.js';
import type { ChatCacheService } from '../rag/chat-cache.service.js';
import type { EmbeddingService } from '../embedding/embedding.service.js';

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

/**
 * Regression: an aborted or errored stream must NOT poison the semantic
 * cache — chatCache.store is called only on clean completion.
 */
describe('streamAnswer cache gating', () => {
  const chunk = {
    chunkId: 'c1',
    content: 'The sky is blue.',
    score: 0.9,
    chunkIndex: 0,
    pageStart: 1,
    pageEnd: 1,
    documentId: 'doc-1',
  };

  function makeService(tokens: string[], failAfter?: number) {
    const store = jest.fn().mockResolvedValue(undefined);
    const chatCache = {
      getExact: jest.fn().mockResolvedValue(null),
      getSemantic: jest.fn().mockResolvedValue(null),
      getQueryEmbedding: jest.fn().mockResolvedValue(null),
      storeQueryEmbedding: jest.fn().mockResolvedValue(undefined),
      store,
    } as unknown as ChatCacheService;
    const retrievalService = {
      retrieve: jest.fn().mockResolvedValue([chunk]),
    } as unknown as RetrievalService;
    const promptService = {
      buildRagMessages: jest.fn().mockReturnValue({
        messages: [{ role: 'user', content: 'q' }],
        includedPositions: [0],
      }),
    } as unknown as PromptService;
    const llmService = {
      // eslint-disable-next-line @typescript-eslint/require-await
      streamMessages: async function* (): AsyncGenerator<string> {
        for (let i = 0; i < tokens.length; i++) {
          if (failAfter !== undefined && i === failAfter) {
            throw new Error('provider blew up');
          }
          yield tokens[i];
        }
      },
    } as unknown as LlmService;
    const embeddingService = {
      embed: jest.fn().mockResolvedValue([0.1, 0.2]),
    } as unknown as EmbeddingService;
    const service = new RagOrchestratorService(
      retrievalService,
      promptService,
      llmService,
      chatCache,
      embeddingService,
    );
    return { service, store };
  }

  const input = { userId: 'u1', documentId: 'doc-1', question: 'why blue?' };

  async function drain(
    gen: AsyncGenerator<RagStreamEvent>,
    abortAfterDeltas?: { controller: AbortController; count: number },
  ): Promise<RagStreamEvent[]> {
    const events: RagStreamEvent[] = [];
    let deltas = 0;
    for await (const ev of gen) {
      events.push(ev);
      if (ev.type === 'delta') {
        deltas += 1;
        if (abortAfterDeltas && deltas === abortAfterDeltas.count) {
          abortAfterDeltas.controller.abort();
        }
      }
    }
    return events;
  }

  it('stores on clean completion', async () => {
    const { service, store } = makeService(['The sky ', 'is blue.']);
    const events = await drain(service.streamAnswer(input));
    expect(events.at(-1)?.type).toBe('done');
    expect(store).toHaveBeenCalledTimes(1);
    // store(scope, settingsKey, question, embedding, display, sources, followUps)
    expect(store).toHaveBeenCalledWith(
      'doc-1',
      'k4',
      'why blue?',
      [0.1, 0.2],
      'The sky is blue.',
      expect.any(Array),
      [],
    );
  });

  it('does NOT store when the client aborts mid-stream', async () => {
    const { service, store } = makeService(['The sky ', 'is blue.']);
    const controller = new AbortController();
    const events = await drain(service.streamAnswer(input, controller.signal), {
      controller,
      count: 1,
    });
    expect(events.at(-1)?.type).toBe('done');
    expect(store).not.toHaveBeenCalled();
  });

  it('does NOT store when the provider stream errors mid-answer', async () => {
    const { service, store } = makeService(['The sky ', 'is blue.'], 1);
    const events = await drain(service.streamAnswer(input));
    expect(events.some((e) => e.type === 'error')).toBe(true);
    expect(events.at(-1)?.type).toBe('done');
    expect(store).not.toHaveBeenCalled();
  });
});
