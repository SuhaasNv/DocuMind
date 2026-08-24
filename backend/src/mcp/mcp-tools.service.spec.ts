import { McpToolsService } from './mcp-tools.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { DocumentsService } from '../documents/documents.service.js';
import type { RetrievalService } from '../documents/retrieval.service.js';
import type { RagOrchestratorService } from '../documents/rag-orchestrator.service.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

const USER = 'user-a';

function textOf(result: CallToolResult): string {
  const first = result.content[0];
  return first && first.type === 'text' ? first.text : '';
}

describe('McpToolsService', () => {
  let prisma: {
    document: { findUnique: jest.Mock; findMany: jest.Mock };
  };
  let documentsService: { findAllByUser: jest.Mock };
  let retrievalService: { retrieveAcross: jest.Mock };
  let ragOrchestrator: { chat: jest.Mock };
  let service: McpToolsService;

  beforeEach(() => {
    prisma = {
      document: { findUnique: jest.fn(), findMany: jest.fn() },
    };
    documentsService = { findAllByUser: jest.fn() };
    retrievalService = { retrieveAcross: jest.fn() };
    ragOrchestrator = { chat: jest.fn() };
    service = new McpToolsService(
      prisma as unknown as PrismaService,
      documentsService as unknown as DocumentsService,
      retrievalService as unknown as RetrievalService,
      ragOrchestrator as unknown as RagOrchestratorService,
    );
  });

  describe('list_documents', () => {
    it('scopes to the token userId, caps at 100, and includes summary + pageCount', async () => {
      const docs = Array.from({ length: 100 }, (_, i) => ({
        id: `doc-${i}`,
        name: `Doc ${i}`,
        status: 'DONE',
        uploadedAt: new Date(),
        progress: 100,
        size: 1234,
        pageCount: i === 0 ? 12 : undefined,
        summary: i === 0 ? 'A short summary.' : null,
      }));
      documentsService.findAllByUser.mockResolvedValue({
        items: docs,
        total: 120,
      });
      const result = await service.listDocuments(USER);
      expect(documentsService.findAllByUser).toHaveBeenCalledWith(USER, 100, 0);
      const parsed = JSON.parse(textOf(result)) as Array<{
        pageCount: number | null;
        summary: string | null;
        sizeBytes: number | null;
      }>;
      expect(parsed).toHaveLength(100);
      expect(parsed[0].pageCount).toBe(12);
      expect(parsed[0].summary).toBe('A short summary.');
      expect(parsed[1].pageCount).toBeNull();
      expect(parsed[1].summary).toBeNull();
      expect(parsed[0].sizeBytes).toBe(1234);
      expect(result.isError).toBeUndefined();
    });
  });

  describe('search_documents validation', () => {
    it('rejects a missing query', async () => {
      const result = await service.searchDocuments(USER, {});
      expect(result.isError).toBe(true);
      expect(textOf(result)).toContain('"query" is required');
    });

    it('rejects an oversized query (>1000 chars)', async () => {
      const result = await service.searchDocuments(USER, {
        query: 'x'.repeat(1001),
      });
      expect(result.isError).toBe(true);
      expect(textOf(result)).toContain('too long');
    });

    it('rejects out-of-bounds and non-integer topK', async () => {
      for (const topK of [0, 11, 2.5, 'five']) {
        const result = await service.searchDocuments(USER, {
          query: 'q',
          topK,
        });
        expect(result.isError).toBe(true);
      }
    });

    it('rejects a non-string documentId', async () => {
      const result = await service.searchDocuments(USER, {
        query: 'q',
        documentId: 42,
      });
      expect(result.isError).toBe(true);
    });
  });

  describe('search_documents scoping', () => {
    it("single-doc: another user's document is 'not found' (no oracle)", async () => {
      prisma.document.findUnique.mockResolvedValue({
        id: 'doc-b',
        name: 'B',
        userId: 'user-b',
        status: 'DONE',
      });
      const result = await service.searchDocuments(USER, {
        query: 'secret',
        documentId: 'doc-b',
      });
      expect(result.isError).toBe(true);
      expect(textOf(result)).toContain('Document not found');
      expect(retrievalService.retrieveAcross).not.toHaveBeenCalled();
    });

    it('single-doc: still-processing document gets an actionable message', async () => {
      prisma.document.findUnique.mockResolvedValue({
        id: 'doc-a',
        name: 'A',
        userId: USER,
        status: 'PROCESSING',
      });
      const result = await service.searchDocuments(USER, {
        query: 'q',
        documentId: 'doc-a',
      });
      expect(result.isError).toBe(true);
      expect(textOf(result)).toContain('still processing');
    });

    it('cross-doc: queries only the token userId and fans out via retrieveAcross', async () => {
      prisma.document.findMany.mockResolvedValue([
        { id: 'doc-1', name: 'One' },
      ]);
      retrievalService.retrieveAcross.mockResolvedValue([
        {
          chunkId: 'c1',
          content: 'hello',
          chunkIndex: 0,
          score: 0.9,
          pageStart: 2,
          pageEnd: 3,
          documentId: 'doc-1',
        },
      ]);
      const result = await service.searchDocuments(USER, { query: 'hello' });
      const findManyCalls = prisma.document.findMany.mock.calls as Array<
        [{ where: { userId: string } }]
      >;
      expect(findManyCalls[0][0].where.userId).toBe(USER);
      expect(retrievalService.retrieveAcross).toHaveBeenCalledWith({
        userId: USER,
        documentIds: ['doc-1'],
        query: 'hello',
        topK: 5,
      });
      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(textOf(result)) as Array<{
        documentId: string;
        documentName: string;
        score: number;
        pageStart: number | null;
        pageEnd: number | null;
      }>;
      expect(parsed[0].documentId).toBe('doc-1');
      expect(parsed[0].documentName).toBe('One');
      expect(parsed[0].score).toBe(0.9);
      expect(parsed[0].pageStart).toBe(2);
      expect(parsed[0].pageEnd).toBe(3);
    });

    it('caps chunk content at 1500 chars', async () => {
      prisma.document.findMany.mockResolvedValue([
        { id: 'doc-1', name: 'One' },
      ]);
      retrievalService.retrieveAcross.mockResolvedValue([
        {
          chunkId: 'c1',
          content: 'y'.repeat(5000),
          chunkIndex: 0,
          score: 0.9,
          pageStart: null,
          pageEnd: null,
          documentId: 'doc-1',
        },
      ]);
      const result = await service.searchDocuments(USER, { query: 'q' });
      const parsed = JSON.parse(textOf(result)) as Array<{ content: string }>;
      expect(parsed[0].content).toHaveLength(1500);
    });
  });

  describe('ask_document', () => {
    it('rejects an oversized question (>4000 chars)', async () => {
      const result = await service.askDocument(USER, {
        documentId: 'doc-1',
        question: 'x'.repeat(4001),
      });
      expect(result.isError).toBe(true);
      expect(ragOrchestrator.chat).not.toHaveBeenCalled();
    });

    it("another user's document is 'not found'; chat is never called", async () => {
      prisma.document.findUnique.mockResolvedValue({
        id: 'doc-b',
        name: 'B',
        userId: 'user-b',
        status: 'DONE',
      });
      const result = await service.askDocument(USER, {
        documentId: 'doc-b',
        question: 'what is inside?',
      });
      expect(result.isError).toBe(true);
      expect(textOf(result)).toContain('Document not found');
      expect(ragOrchestrator.chat).not.toHaveBeenCalled();
    });

    it('passes the token userId (never a tool arg) and formats the Sources block', async () => {
      prisma.document.findUnique.mockResolvedValue({
        id: 'doc-1',
        name: 'One',
        userId: USER,
        status: 'DONE',
      });
      ragOrchestrator.chat.mockResolvedValue({
        answer: 'The answer [1].',
        sources: [
          {
            marker: 1,
            chunkIndex: 2,
            score: 0.87,
            snippet: 'A snippet.',
            pageStart: 3,
            pageEnd: 4,
            quote: 'A quote.',
          },
        ],
        cached: true,
      });
      const result = await service.askDocument(USER, {
        documentId: 'doc-1',
        question: 'what is inside?',
        // Hostile arg: must be ignored — identity comes from the token.
        userId: 'user-b',
      });
      expect(ragOrchestrator.chat).toHaveBeenCalledWith({
        userId: USER,
        documentId: 'doc-1',
        question: 'what is inside?',
      });
      const text = textOf(result);
      expect(text).toContain('The answer [1].');
      expect(text).toContain('Sources:');
      expect(text).toContain('[1] Page 3-4 — "A quote." (One)');
      expect(text).toContain('semantic cache');
    });

    it('omits the page prefix when the source has no page metadata', async () => {
      prisma.document.findUnique.mockResolvedValue({
        id: 'doc-1',
        name: 'One',
        userId: USER,
        status: 'DONE',
      });
      ragOrchestrator.chat.mockResolvedValue({
        answer: 'The answer [1].',
        sources: [
          {
            marker: 1,
            chunkIndex: 0,
            score: 0.5,
            snippet: 's',
            pageStart: null,
            pageEnd: null,
            quote: 'Old chunk.',
          },
        ],
      });
      const result = await service.askDocument(USER, {
        documentId: 'doc-1',
        question: 'q',
      });
      expect(textOf(result)).toContain('[1] "Old chunk." (One)');
    });
  });
});
