import type { Components } from 'react-markdown';
import type { ChatSource } from '@/stores/useAppStore';

/**
 * Shared ReactMarkdown component config for AI answers — used by the chat
 * MessageBubble and the Knowledge Garden insight cards so both render
 * identically. No rehype-raw: raw HTML in content stays inert text.
 */
export const chatMarkdownComponents: Components = {
  code: ({ className, children, ...props }) => {
    const match = /language-(\w+)/.exec(className || '');
    const isInline = !match;
    return isInline ? (
      <code
        className="px-1.5 py-0.5 rounded bg-muted text-primary text-sm font-mono"
        {...props}
      >
        {children}
      </code>
    ) : (
      <pre className="bg-muted/50 rounded-lg p-4 overflow-x-auto my-3">
        <code className="text-sm font-mono text-foreground" {...props}>
          {children}
        </code>
      </pre>
    );
  },
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="list-disc pl-4 mb-2">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-4 mb-2">{children}</ol>,
  li: ({ children }) => <li className="mb-1">{children}</li>,
  h1: ({ children }) => <h1 className="text-lg font-bold mb-2">{children}</h1>,
  h2: ({ children }) => <h2 className="text-base font-bold mb-2">{children}</h2>,
  h3: ({ children }) => <h3 className="text-sm font-bold mb-1">{children}</h3>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-primary pl-4 italic text-muted-foreground">
      {children}
    </blockquote>
  ),
};

interface CiteAnchorOptions {
  sourceByMarker: Map<number, ChatSource>;
  onChipClick: (marker: number) => void;
}

/**
 * Factory for the `a` override that renders internal #cite-N links (produced
 * by linkifyCitations) as inline [n] citation chips; other links open in a
 * new tab.
 */
export function makeCiteAnchor({
  sourceByMarker,
  onChipClick,
}: CiteAnchorOptions): Components['a'] {
  const CiteAnchor: Components['a'] = ({ href, children, ...props }) => {
    const cite = href?.startsWith('#cite-') ? parseInt(href.slice(6), 10) : NaN;
    if (!Number.isNaN(cite) && sourceByMarker.has(cite)) {
      return (
        <button
          type="button"
          onClick={() => onChipClick(cite)}
          className="cite-chip"
          aria-label={`Show source ${cite}`}
        >
          {cite}
        </button>
      );
    }
    return (
      <a href={href} target="_blank" rel="noreferrer" {...props}>
        {children}
      </a>
    );
  };
  return CiteAnchor;
}

/**
 * Sources in marker order ([1], [2], ...) plus a marker → source lookup so
 * cards and inline chips agree.
 */
export function citationIndex(sources: ChatSource[]): {
  sorted: ChatSource[];
  byMarker: Map<number, ChatSource>;
} {
  const sorted = [...sources].sort(
    (a, b) => (a.marker ?? a.chunkIndex + 1) - (b.marker ?? b.chunkIndex + 1),
  );
  return {
    sorted,
    byMarker: new Map(sorted.map((src, i) => [src.marker ?? i + 1, src])),
  };
}

/**
 * Turns known inline [n] citation markers into internal #cite-N links (the
 * chips above); unknown numbers stay plain text. With showChips false, known
 * markers are stripped entirely (sources hidden).
 */
export function linkifyCitations(
  content: string,
  sourceByMarker: Map<number, ChatSource>,
  showChips: boolean,
): string {
  return content.replace(/\[(\d{1,2})\](?!\()/g, (full, num: string) => {
    const n = parseInt(num, 10);
    if (!sourceByMarker.has(n)) return full;
    if (!showChips) return '';
    return `[${n}](#cite-${n})`;
  });
}

/** Human-readable page label for a source card. */
export function pageLabel(src: ChatSource): string {
  return src.pageStart != null
    ? src.pageStart === src.pageEnd || src.pageEnd == null
      ? `Page ${src.pageStart}`
      : `Pages ${src.pageStart}-${src.pageEnd}`
    : 'Page unknown. Reprocess for precise citations';
}
