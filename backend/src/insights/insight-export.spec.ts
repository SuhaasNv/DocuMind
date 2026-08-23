import {
  EXPORT_FILENAME,
  insightsToMarkdown,
  mdText,
} from './insight-export.js';
import type { InsightResponseDto } from './dto/insight-response.dto.js';

const insight = (
  over: Partial<InsightResponseDto> = {},
): InsightResponseDto => ({
  id: 'ins-1',
  question: 'What is the codename?',
  content: 'The codename is **AURORA-7**.',
  sources: [{ chunkIndex: 2, score: 0.87, snippet: 'codename is AURORA-7' }],
  documentId: 'doc-1',
  documentName: 'launch-plan.pdf',
  collectionId: null,
  userNote: null,
  tags: [],
  createdAt: new Date('2026-08-24T00:00:00Z'),
  ...over,
});

describe('insight export serializer', () => {
  it('filename is a fixed safe constant', () => {
    expect(EXPORT_FILENAME).toBe('documind-garden.md');
  });

  it('produces question heading, answer body, note, tags, and sources appendix', () => {
    const md = insightsToMarkdown(
      [
        insight({
          userNote: 'Check the June date.',
          tags: ['launch', 'secret'],
        }),
      ],
      new Date('2026-08-24T12:00:00Z'),
    );
    expect(md).toContain('# DocuMind Knowledge Garden');
    expect(md).toContain('Exported 2026-08-24 — 1 insight');
    expect(md).toContain('## What is the codename?');
    expect(md).toContain('The codename is **AURORA-7**.');
    expect(md).toContain('*Document: launch-plan.pdf*');
    expect(md).toContain('**Note:** Check the June date.');
    expect(md).toContain('**Tags:** launch, secret');
    expect(md).toContain('### Sources');
    expect(md).toContain('- §3 (relevance 87%): codename is AURORA-7');
  });

  it('keeps hostile content inert as plain text (no raw HTML, no live links)', () => {
    const md = insightsToMarkdown([
      insight({
        question: '<script>alert(1)</script>',
        content:
          'Click [x](javascript:alert(1)) or <img src=x onerror=alert(1)>',
      }),
    ]);
    // Raw HTML tags are escaped so Markdown renderers treat them as text:
    // every `<` and `[` is backslash-escaped, none survives unescaped.
    expect(md).not.toMatch(/[^\\]<script>/);
    expect(md).toContain('\\<script>');
    expect(md).not.toMatch(/[^\\]<img/);
    expect(md).toContain('\\<img');
    // Link syntax is escaped so no javascript: link survives.
    expect(md).not.toMatch(/[^\\]\[x\]\(javascript:/);
    expect(md).toContain('\\[x](javascript:alert(1))');
  });

  it('strips raw control characters but keeps newlines and tabs', () => {
    expect(mdText('a\u0000b\u0007c\r\nd\te')).toBe('abc\nd\te');
  });

  it('newlines in the question collapse to a single heading line', () => {
    const md = insightsToMarkdown([
      insight({ question: 'line one\nline two' }),
    ]);
    expect(md).toContain('## line one line two');
  });

  it('omits empty note/tags/sources blocks', () => {
    const md = insightsToMarkdown([
      insight({ sources: [], documentName: null }),
    ]);
    expect(md).not.toContain('**Note:**');
    expect(md).not.toContain('**Tags:**');
    expect(md).not.toContain('### Sources');
    expect(md).not.toContain('*Document:');
  });
});
