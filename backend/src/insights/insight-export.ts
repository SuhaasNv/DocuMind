import type { InsightResponseDto } from './dto/insight-response.dto.js';

/** Fixed download filename — never derived from user input. */
export const EXPORT_FILENAME = 'documind-garden.md';

/**
 * Make user text inert Markdown:
 * - strip raw control characters (keep \n and \t),
 * - escape `<` so raw HTML (e.g. <script>) stays plain text in any renderer,
 * - escape `[` so links (e.g. [x](javascript:...)) stay plain text.
 * No HTML entity encoding — this is a Markdown file, not HTML.
 */
export function mdText(text: string): string {
  return (
    text
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B-\u000D\u000E-\u001F\u007F]/g, '')
      .replace(/</g, '\\<')
      .replace(/\[/g, '\\[')
  );
}

/** Single-line variant for headings and list items. */
function mdLine(text: string): string {
  return mdText(text).replace(/\s+/g, ' ').trim();
}

/**
 * Pure serializer: pinned insights → one Markdown document.
 * Each insight is a section (question heading, answer body, note, tags)
 * followed by a per-insight Sources appendix.
 */
export function insightsToMarkdown(
  insights: InsightResponseDto[],
  now: Date = new Date(),
): string {
  const lines: string[] = [
    '# DocuMind Knowledge Garden',
    '',
    `Exported ${now.toISOString().slice(0, 10)} — ${insights.length} insight${insights.length === 1 ? '' : 's'}`,
    '',
  ];

  for (const insight of insights) {
    lines.push(`## ${mdLine(insight.question)}`, '');
    lines.push(mdText(insight.content), '');
    if (insight.documentName) {
      lines.push(`*Document: ${mdLine(insight.documentName)}*`, '');
    }
    if (insight.userNote) {
      lines.push(`**Note:** ${mdText(insight.userNote)}`, '');
    }
    if (insight.tags.length > 0) {
      lines.push(`**Tags:** ${insight.tags.map(mdLine).join(', ')}`, '');
    }
    if (insight.sources.length > 0) {
      lines.push('### Sources', '');
      for (const src of insight.sources) {
        const quote = src.snippet ? `: ${mdLine(src.snippet)}` : '';
        lines.push(
          `- §${src.chunkIndex + 1} (relevance ${Math.round(src.score * 100)}%)${quote}`,
        );
      }
      lines.push('');
    }
    lines.push('---', '');
  }

  return lines.join('\n');
}
