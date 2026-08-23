import { chunkText, countTokens } from './chunking.js';

const SENTENCES = [
  'The ingestion pipeline processes documents in the background.',
  'Vector search finds semantically similar chunks quickly.',
  'Retrieval augmented generation grounds every answer in sources.',
  'PostgreSQL with pgvector supports cosine distance queries.',
  'The worker embeds chunks in batches for throughput.',
];

function makeParagraphs(paragraphs: number, sentencesPer: number): string {
  const out: string[] = [];
  for (let p = 0; p < paragraphs; p++) {
    const lines: string[] = [];
    for (let s = 0; s < sentencesPer; s++) {
      lines.push(
        `Paragraph ${p + 1} point ${s + 1}: ${SENTENCES[(p + s) % SENTENCES.length]}`,
      );
    }
    out.push(lines.join(' '));
  }
  return out.join('\n\n');
}

describe('chunkText (token-aware recursive)', () => {
  it('empty input produces zero chunks', () => {
    expect(chunkText('')).toEqual([]);
  });

  it('whitespace-only input produces zero chunks', () => {
    expect(chunkText('   \n\n\t  ')).toEqual([]);
  });

  it('text shorter than one chunk returns a single chunk with the full text', () => {
    const text = 'One short sentence.';
    const chunks = chunkText(text);
    expect(chunks).toEqual([
      { content: text, index: 0, charStart: 0, charEnd: text.length },
    ]);
  });

  it('charStart/charEnd point at each chunk own content in the input', () => {
    const text = makeParagraphs(12, 6);
    const chunks = chunkText(text, { maxTokens: 120, overlapTokens: 18 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.charStart).toBeGreaterThanOrEqual(0);
      expect(c.charEnd).toBeGreaterThan(c.charStart);
      const original = text.slice(c.charStart, c.charEnd);
      // The chunk's own content ends exactly at charEnd...
      expect(c.content.endsWith(original.slice(-40))).toBe(true);
      // ...and the text at charStart begins the non-overlap part of the chunk.
      expect(c.content).toContain(original.slice(0, 40));
    }
    // Offsets are monotonically increasing across chunks.
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i].charStart).toBeGreaterThan(chunks[i - 1].charStart);
    }
  });

  it('normal text: chunks respect the token budget and indices are sequential', () => {
    const text = makeParagraphs(20, 8);
    const chunks = chunkText(text, { maxTokens: 120, overlapTokens: 18 });
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((c, i) => {
      expect(c.index).toBe(i);
      expect(countTokens(c.content)).toBeLessThanOrEqual(120);
    });
  });

  it('normal text: full sentence coverage and no mid-word chunk tails', () => {
    const text = makeParagraphs(12, 6);
    const chunks = chunkText(text, { maxTokens: 120, overlapTokens: 18 });
    const joined = chunks.map((c) => c.content).join('\n');
    for (const p of text.split(/\n\n/)) {
      for (const sentence of p.split(/(?<=[.!?])\s+/)) {
        expect(joined).toContain(sentence);
      }
    }
    for (const c of chunks.slice(0, -1)) {
      // Sentence-structured input: every non-final chunk ends at a sentence end.
      expect(c.content).toMatch(/[.!?]$/);
    }
  });

  it('whitespace-free text (base64/CJK-like) keeps full coverage via token cuts', () => {
    const text = 'QWxhZGRpbjpvcGVuIHNlc2FtZQ+/0123456789abcdef'.repeat(120);
    const chunks = chunkText(text, { maxTokens: 100, overlapTokens: 0 });
    expect(chunks.length).toBeGreaterThan(1);
    // With zero overlap, concatenation reconstructs the original exactly.
    expect(chunks.map((c) => c.content).join('')).toBe(text);
  });

  it('consecutive chunks share overlapping content', () => {
    const text = makeParagraphs(20, 8);
    const chunks = chunkText(text, { maxTokens: 120, overlapTokens: 30 });
    for (let i = 1; i < chunks.length; i++) {
      const prevTailWords = chunks[i - 1].content.split(/\s+/).slice(-3);
      const head = chunks[i].content.slice(0, 400);
      // At least one of the previous chunk's last words re-appears at the
      // head of the next chunk via the token overlap seed.
      expect(prevTailWords.some((w) => head.includes(w))).toBe(true);
    }
  });
});
