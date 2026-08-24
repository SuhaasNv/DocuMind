import { Injectable, Logger, HttpException } from '@nestjs/common';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  type CallToolResult,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { DocumentStatus } from '../../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { DocumentsService } from '../documents/documents.service.js';
import { RetrievalService } from '../documents/retrieval.service.js';
import { RagOrchestratorService } from '../documents/rag-orchestrator.service.js';

// SECURITY: the MCP surface is read + ask ONLY by design. It exposes no
// upload, delete, rename, retry, or admin tools — an API token must never be
// able to mutate the account or its documents. Do not add write tools here.

const MAX_LIST_DOCUMENTS = 100;
const MAX_QUERY_LENGTH = 1000;
const MAX_QUESTION_LENGTH = 4000;
const MAX_DOCUMENT_ID_LENGTH = 64;
const MAX_CHUNK_CONTENT_LENGTH = 1500;
const DEFAULT_TOP_K = 5;

const TOOLS: Tool[] = [
  {
    name: 'list_documents',
    description:
      "List the user's documents in DocuMind. Returns up to 100 documents " +
      'with id, name, processing status (PENDING | PROCESSING | DONE | ' +
      'FAILED), upload date, size in bytes, page count, and a short summary ' +
      '(null until generated). Call this first to discover document ids for ' +
      'search_documents or ask_document. Only documents with status DONE ' +
      'can be searched or asked about.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'search_documents',
    description:
      "Retrieve the most relevant passages from the user's documents for a " +
      'query (hybrid dense + full-text retrieval, no LLM). Returns raw ' +
      'chunks with a relevance score (cosine similarity), chunk index, page ' +
      "range, and the owning document's id and name. Pass documentId to " +
      'search one document; omit ' +
      "it to search across all of the user's processed documents. Use this " +
      'when you need source material or to locate where a topic is ' +
      'discussed. For a synthesized, cited answer, use ask_document instead.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          minLength: 1,
          maxLength: MAX_QUERY_LENGTH,
          description: 'What to search for, in natural language or keywords.',
        },
        documentId: {
          type: 'string',
          description:
            'Optional: restrict the search to this document (from list_documents).',
        },
        topK: {
          type: 'integer',
          minimum: 1,
          maximum: 10,
          default: DEFAULT_TOP_K,
          description: 'How many chunks to return (1-10, default 5).',
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'ask_document',
    description:
      'Ask a natural-language question about ONE document and get a ' +
      'grounded answer generated with retrieval-augmented generation. The ' +
      'answer cites its context with numeric [n] markers and is followed ' +
      'by a Sources block resolving each marker to a page range, quote, ' +
      'and document name. The document ' +
      'must be owned by the user and fully processed (status DONE — see ' +
      'list_documents). Repeated or similar questions may be served from a ' +
      'semantic cache.',
    inputSchema: {
      type: 'object',
      properties: {
        documentId: {
          type: 'string',
          description: 'The document to ask about (from list_documents).',
        },
        question: {
          type: 'string',
          minLength: 1,
          maxLength: MAX_QUESTION_LENGTH,
          description: 'The question to answer from the document.',
        },
      },
      required: ['documentId', 'question'],
      additionalProperties: false,
    },
  },
];

function textResult(text: string): CallToolResult {
  return { content: [{ type: 'text', text }] };
}

function errorResult(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

/** Validation helpers — never trust tool args. */
function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function stringArg(
  args: Record<string, unknown>,
  key: string,
  maxLength: number,
  required: boolean,
): { ok: true; value: string | undefined } | { ok: false; message: string } {
  const raw = args[key];
  if (raw === undefined || raw === null) {
    if (required) return { ok: false, message: `"${key}" is required.` };
    return { ok: true, value: undefined };
  }
  if (typeof raw !== 'string') {
    return { ok: false, message: `"${key}" must be a string.` };
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { ok: false, message: `"${key}" must not be empty.` };
  }
  if (raw.length > maxLength) {
    return {
      ok: false,
      message: `"${key}" is too long (max ${maxLength} characters).`,
    };
  }
  return { ok: true, value: trimmed };
}

function topKArg(
  args: Record<string, unknown>,
): { ok: true; value: number } | { ok: false; message: string } {
  const raw = args['topK'];
  if (raw === undefined || raw === null)
    return { ok: true, value: DEFAULT_TOP_K };
  if (
    typeof raw !== 'number' ||
    !Number.isInteger(raw) ||
    raw < 1 ||
    raw > 10
  ) {
    return {
      ok: false,
      message: '"topK" must be an integer between 1 and 10.',
    };
  }
  return { ok: true, value: raw };
}

/**
 * MCP tool layer: thin, read+ask-only wrappers over the existing services.
 * The userId is ALWAYS the one attached by ApiTokenGuard — identity never
 * comes from tool arguments.
 */
@Injectable()
export class McpToolsService {
  private readonly logger = new Logger(McpToolsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly documentsService: DocumentsService,
    private readonly retrievalService: RetrievalService,
    private readonly ragOrchestrator: RagOrchestratorService,
  ) {}

  /**
   * Build a per-request MCP server bound to one user. Stateless: a fresh
   * Server instance per HTTP request (SDK-recommended stateless pattern).
   */
  createServer(userId: string): Server {
    const server = new Server(
      { name: 'documind', version: '1.0.0' },
      { capabilities: { tools: {} } },
    );

    server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: TOOLS }));

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const name = request.params.name;
      const args = asRecord(request.params.arguments);
      const t0 = performance.now();
      let result: CallToolResult;
      try {
        switch (name) {
          case 'list_documents':
            result = await this.listDocuments(userId);
            break;
          case 'search_documents':
            result = await this.searchDocuments(userId, args);
            break;
          case 'ask_document':
            result = await this.askDocument(userId, args);
            break;
          default:
            result = errorResult(
              `Unknown tool "${name}". Available tools: list_documents, search_documents, ask_document.`,
            );
        }
      } catch (err) {
        // Map service errors to actionable MCP tool errors — never a 500 or
        // a stack trace over the wire.
        result = errorResult(this.friendlyMessage(err));
      }
      const ms = Math.round(performance.now() - t0);
      this.logger.log(
        `[mcp] tool=${name} user=${userId} ms=${ms} ${result.isError ? 'fail' : 'ok'}`,
      );
      return result;
    });

    return server;
  }

  private friendlyMessage(err: unknown): string {
    if (err instanceof HttpException) {
      const message = err.message;
      if (message.includes('not ready') || message.includes('status:')) {
        return 'Document is still processing - try again shortly.';
      }
      return message;
    }
    this.logger.error(
      '[mcp] tool call failed',
      err instanceof Error ? err.stack : String(err),
    );
    return 'Something went wrong handling this tool call. Please try again.';
  }

  async listDocuments(userId: string): Promise<CallToolResult> {
    const { items: docs } = await this.documentsService.findAllByUser(
      userId,
      MAX_LIST_DOCUMENTS,
      0,
    );
    const items = docs.map((d) => ({
      id: d.id,
      name: d.name,
      status: d.status,
      uploadedAt: d.uploadedAt,
      sizeBytes: d.size ?? null,
      pageCount: d.pageCount ?? null,
      summary: d.summary,
    }));
    if (items.length === 0) {
      return textResult(
        'No documents found. Upload a PDF in the DocuMind app first.',
      );
    }
    return textResult(JSON.stringify(items, null, 2));
  }

  async searchDocuments(
    userId: string,
    args: Record<string, unknown>,
  ): Promise<CallToolResult> {
    const query = stringArg(args, 'query', MAX_QUERY_LENGTH, true);
    if (!query.ok) return errorResult(query.message);
    const documentId = stringArg(
      args,
      'documentId',
      MAX_DOCUMENT_ID_LENGTH,
      false,
    );
    if (!documentId.ok) return errorResult(documentId.message);
    const topK = topKArg(args);
    if (!topK.ok) return errorResult(topK.message);

    // ONE documents lookup: resolves the target ids AND the names used to
    // label each returned chunk (no per-chunk queries).
    let targets: Array<{ id: string; name: string }>;
    if (documentId.value !== undefined) {
      const doc = await this.findOwnedDoneDocument(userId, documentId.value);
      if ('error' in doc) return errorResult(doc.error);
      targets = [{ id: doc.id, name: doc.name }];
    } else {
      targets = await this.prisma.document.findMany({
        where: { userId, status: DocumentStatus.DONE },
        orderBy: { uploadedAt: 'desc' },
        select: { id: true, name: true },
      });
      if (targets.length === 0) {
        return textResult(
          'No processed documents to search. Upload a PDF in DocuMind and wait for processing to finish.',
        );
      }
    }
    const nameById = new Map(targets.map((t) => [t.id, t.name]));

    const results = await this.retrievalService.retrieveAcross({
      userId,
      documentIds: targets.map((t) => t.id),
      query: query.value ?? '',
      topK: topK.value,
    });
    const chunks = results.map((r) => ({
      documentId: r.documentId,
      documentName: nameById.get(r.documentId) ?? 'Unknown document',
      chunkIndex: r.chunkIndex,
      score: r.score,
      pageStart: r.pageStart,
      pageEnd: r.pageEnd,
      content: r.content.slice(0, MAX_CHUNK_CONTENT_LENGTH),
    }));

    if (chunks.length === 0) {
      return textResult('No matching passages found for this query.');
    }
    return textResult(JSON.stringify(chunks, null, 2));
  }

  async askDocument(
    userId: string,
    args: Record<string, unknown>,
  ): Promise<CallToolResult> {
    const documentId = stringArg(
      args,
      'documentId',
      MAX_DOCUMENT_ID_LENGTH,
      true,
    );
    if (!documentId.ok) return errorResult(documentId.message);
    const question = stringArg(args, 'question', MAX_QUESTION_LENGTH, true);
    if (!question.ok) return errorResult(question.message);

    const doc = await this.findOwnedDoneDocument(
      userId,
      documentId.value ?? '',
    );
    if ('error' in doc) return errorResult(doc.error);

    // MCP calls are stateless tool invocations: call the orchestrator
    // directly, bypassing the documents controller's conversation
    // persistence (beginTurn/completeTurn) — no Conversation rows here.
    const response = await this.ragOrchestrator.chat({
      userId,
      documentId: doc.id,
      question: question.value ?? '',
    });

    // The answer already carries numeric [n] markers; resolve each marker
    // to its page range, quote, and document name.
    const sourceLines = response.sources.map((s) => {
      const page =
        s.pageStart === null
          ? ''
          : s.pageStart === s.pageEnd || s.pageEnd === null
            ? `Page ${s.pageStart} — `
            : `Page ${s.pageStart}-${s.pageEnd} — `;
      return `[${s.marker}] ${page}"${s.quote}" (${s.documentName ?? doc.name})`;
    });
    const parts = [response.answer];
    if (sourceLines.length > 0) {
      parts.push('', 'Sources:', ...sourceLines);
    }
    if (response.cached) {
      parts.push('', '(served from semantic cache)');
    }
    return textResult(parts.join('\n'));
  }

  /**
   * Ownership + readiness check. Not-found and not-owned collapse into ONE
   * message so the tool is not an oracle for other users' document ids.
   */
  private async findOwnedDoneDocument(
    userId: string,
    documentId: string,
  ): Promise<{ id: string; name: string } | { error: string }> {
    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: { id: true, name: true, userId: true, status: true },
    });
    if (!doc || doc.userId !== userId) {
      return {
        error:
          'Document not found. Use list_documents to see the available document ids.',
      };
    }
    if (doc.status !== DocumentStatus.DONE) {
      return { error: 'Document is still processing - try again shortly.' };
    }
    return { id: doc.id, name: doc.name };
  }
}
