import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { FileText, Link2Off, Loader2 } from 'lucide-react';
import {
  chatMarkdownComponents,
  citationIndex,
  linkifyCitations,
  makeCiteAnchor,
  pageLabel,
} from '@/components/chat/markdownComponents';
import type { ChatSource } from '@/stores/useAppStore';
import { getApiBaseUrl } from '@/lib/api';

/** Mirrors the backend snapshot whitelist — nothing else ever arrives. */
interface SharedSource {
  marker: number;
  pageStart: number | null;
  pageEnd: number | null;
  quote: string | null;
  snippet: string;
}

interface SharedSnapshot {
  question: string;
  answer: string;
  sources: SharedSource[];
  sharedAt: string;
}

type PageState =
  | { kind: 'loading' }
  | { kind: 'ok'; snapshot: SharedSnapshot }
  | { kind: 'notfound' }
  | { kind: 'gone' }
  | { kind: 'error' };

const TOKEN_RE = /^[a-f0-9]{32,64}$/;

function scrollToSource(marker: number): void {
  const el =
    document.getElementById(`share-src-${marker}`) ??
    document.getElementById('share-sources');
  el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/**
 * Adapt a snapshot source to the ChatSource shape the shared markdown module
 * expects. Only whitelisted fields exist here — chunkIndex/score are synthetic
 * fillers, never displayed on this page.
 */
function toChatSource(src: SharedSource, i: number): ChatSource {
  return {
    marker: src.marker,
    chunkIndex: (src.marker || i + 1) - 1,
    score: 0,
    snippet: src.snippet,
    pageStart: src.pageStart,
    pageEnd: src.pageEnd,
    quote: src.quote ?? undefined,
  };
}

/**
 * Public read-only page for a shared answer. Fully unauthenticated: one plain
 * fetch to /share/public/:token, no app shell, no tokens, no file access.
 */
const SharePage = () => {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<PageState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    const base = getApiBaseUrl();
    if (!token || !TOKEN_RE.test(token) || !base) {
      setState({ kind: 'notfound' });
      return;
    }
    fetch(`${base}/share/public/${token}`)
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 404) return setState({ kind: 'notfound' });
        if (res.status === 410) return setState({ kind: 'gone' });
        if (!res.ok) return setState({ kind: 'error' });
        const snapshot = (await res.json()) as SharedSnapshot;
        if (!cancelled) setState({ kind: 'ok', snapshot });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Marker-keyed index over the snapshot's sources so inline [n] chips and
  // the sources list agree — same machinery as in-app chat.
  const { sorted, byMarker } = citationIndex(
    state.kind === 'ok' ? state.snapshot.sources.map(toChatSource) : [],
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
        {/* DocuMind badge */}
        <Link
          to="/"
          className="inline-flex items-center gap-2 mb-8 text-sm font-semibold hover:opacity-80 transition-opacity"
          aria-label="DocuMind home"
        >
          <span className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center">
            <FileText className="w-4 h-4 text-primary" aria-hidden="true" />
          </span>
          DocuMind
          <span className="text-muted-foreground font-normal">· shared answer</span>
        </Link>

        {state.kind === 'loading' && (
          <div className="flex items-center gap-2 text-muted-foreground py-16 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            Loading shared answer…
          </div>
        )}

        {(state.kind === 'notfound' || state.kind === 'gone' || state.kind === 'error') && (
          <div className="text-center py-16">
            <Link2Off className="w-8 h-8 mx-auto mb-4 text-muted-foreground" aria-hidden="true" />
            <h1 className="text-lg font-semibold mb-2">
              {state.kind === 'gone'
                ? 'This link is no longer available'
                : state.kind === 'notfound'
                  ? 'Share link not found'
                  : 'Something went wrong'}
            </h1>
            <p className="text-sm text-muted-foreground mb-6">
              {state.kind === 'gone'
                ? 'The person who shared it revoked it, or it expired.'
                : state.kind === 'notfound'
                  ? 'Double-check the link — it may have been mistyped or deleted.'
                  : 'We could not load this shared answer. Please try again later.'}
            </p>
            <Link to="/" className="text-sm text-primary hover:underline">
              Learn more about DocuMind →
            </Link>
          </div>
        )}

        {state.kind === 'ok' && (
          <article>
            {/* Question */}
            <div className="rounded-2xl bg-primary/10 px-4 py-3 mb-4">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
                Question
              </p>
              <p className="font-medium break-words">{state.snapshot.question}</p>
            </div>

            {/* Answer — same renderer as in-app chat; raw HTML stays inert */}
            <div className="rounded-2xl bg-secondary/50 border border-border/50 px-4 py-3">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Answer
              </p>
              <div className="prose prose-invert prose-sm max-w-none break-words">
                <ReactMarkdown
                  components={{
                    ...chatMarkdownComponents,
                    a: makeCiteAnchor({ sourceByMarker: byMarker, onChipClick: scrollToSource }),
                  }}
                >
                  {linkifyCitations(state.snapshot.answer, byMarker, true)}
                </ReactMarkdown>
              </div>
            </div>

            {/* Sources: marker / pages / quote only */}
            {state.snapshot.sources.length > 0 && (
              <div id="share-sources" className="mt-4">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">
                  Sources
                </p>
                <div className="flex flex-col gap-1.5">
                  {sorted.map((src, i) => {
                    const marker = src.marker ?? i + 1;
                    return (
                      <div
                        key={marker}
                        id={`share-src-${marker}`}
                        className="flex items-start gap-2 rounded-lg bg-muted/30 px-2.5 py-2 text-xs"
                      >
                        <span className="shrink-0 mt-0.5 font-mono text-[10px] font-semibold text-primary/70 bg-primary/10 rounded px-1 py-0.5 leading-none">
                          [{marker}]
                        </span>
                        <div className="flex-1 min-w-0">
                          {src.pageStart != null && (
                            <span className="block text-[10px] font-medium text-foreground/70 mb-0.5">
                              {pageLabel(src)}
                            </span>
                          )}
                          <span className="text-muted-foreground leading-relaxed break-words">
                            {src.quote ? <em>“{src.quote}”</em> : src.snippet || `Source ${marker}`}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <p className="mt-8 text-xs text-muted-foreground text-center">
              AI-generated answer shared via{' '}
              <Link to="/" className="text-primary hover:underline">
                DocuMind
              </Link>
              {' '}· shared {new Date(state.snapshot.sharedAt).toLocaleDateString()}
            </p>
          </article>
        )}
      </div>
    </div>
  );
};

export default SharePage;
