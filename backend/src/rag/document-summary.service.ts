import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { LlmService } from './llm.service.js';

/** Characters of document text given to the summary prompt. */
const SUMMARY_INPUT_CHARS = 6000;
const SUGGESTED_QUESTION_COUNT = 4;
/** Chunks (in document order) concatenated as input for lazy backfill. */
const BACKFILL_CHUNK_COUNT = 4;

export interface SummaryResult {
  summary: string;
  questions: string[];
}

/**
 * Parse the strict-JSON summary payload defensively: strip markdown fences,
 * validate shapes. Returns null when unusable (e.g. the stub provider's
 * non-JSON answer) — callers log a warning and continue.
 */
export function parseSummaryResponse(raw: string): SummaryResult | null {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  try {
    const parsed: unknown = JSON.parse(cleaned);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { summary, questions } = parsed as {
      summary?: unknown;
      questions?: unknown;
    };
    if (typeof summary !== 'string' || summary.trim().length === 0) return null;
    if (!Array.isArray(questions)) return null;
    const qs = questions
      .filter((q): q is string => typeof q === 'string' && q.trim().length > 0)
      .map((q) => q.trim())
      .slice(0, SUGGESTED_QUESTION_COUNT);
    if (qs.length === 0) return null;
    return { summary: summary.trim(), questions: qs };
  } catch {
    return null;
  }
}

/**
 * Instant activation (Phase 8): one LLM call generating a ~3-sentence summary
 * plus suggested questions, stored on the Document row. Used at the end of
 * document processing and as a lazy backfill for pre-Phase-8 documents.
 * Generation is best-effort: failures are logged, never thrown.
 */
@Injectable()
export class DocumentSummaryService {
  private readonly logger = new Logger(DocumentSummaryService.name);
  // ponytail: in-memory in-flight guard is per-process; a distributed lock
  // is only needed if the API ever runs multi-instance.
  private readonly inFlight = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly llmService: LlmService,
  ) {}

  /** Generate summary + questions from document text and store them. */
  async generateForText(
    documentId: string,
    name: string,
    text: string,
  ): Promise<void> {
    try {
      const prompt =
        `You will be given the beginning of a document titled "${name}".\n\n` +
        `Document text:\n${text.slice(0, SUMMARY_INPUT_CHARS)}\n\n` +
        `Respond with STRICT JSON only (no markdown, no commentary) in exactly this shape:\n` +
        `{"summary": "...", "questions": ["...","...","...","..."]}\n` +
        `- "summary": about 3 sentences summarizing the document.\n` +
        `- "questions": exactly ${SUGGESTED_QUESTION_COUNT} short, specific questions this document can answer.`;
      const raw = await this.llmService.complete(prompt);
      const parsed = parseSummaryResponse(raw);
      if (!parsed) {
        this.logger.warn(
          `Summary generation for document ${documentId} returned unparsable output; skipping`,
        );
        return;
      }
      await this.prisma.document.update({
        where: { id: documentId },
        data: {
          summary: parsed.summary,
          suggestedQuestions: parsed.questions,
        },
      });
      this.logger.log(`Stored summary for document ${documentId}`);
    } catch (err) {
      this.logger.warn(
        `Summary generation for document ${documentId} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Lazy backfill for a DONE document with no summary, fired without awaiting
   * from GET /documents/:id. The in-flight set prevents concurrent duplicate
   * generation for the same document.
   */
  async backfill(documentId: string, name: string): Promise<void> {
    if (this.inFlight.has(documentId)) return;
    this.inFlight.add(documentId);
    try {
      const chunks = await this.prisma.documentChunk.findMany({
        where: { documentId },
        orderBy: { chunkIndex: 'asc' },
        take: BACKFILL_CHUNK_COUNT,
        select: { content: true },
      });
      const text = chunks.map((c) => c.content).join('\n');
      if (text.trim().length === 0) return;
      await this.generateForText(documentId, name, text);
    } catch (err) {
      this.logger.warn(
        `Summary backfill for document ${documentId} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      this.inFlight.delete(documentId);
    }
  }
}
