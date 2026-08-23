import { memo, useState, useEffect, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Message, type ChatSource } from '@/stores/useAppStore';
import { usePreferencesStore } from '@/stores/usePreferencesStore';
import {
  Bot,
  User,
  Copy,
  Check,
  RefreshCw,
  RotateCcw,
  AlertCircle,
  Pin,
  Share2,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  chatMarkdownComponents,
  citationIndex,
  linkifyCitations,
  makeCiteAnchor,
  pageLabel,
} from './markdownComponents';

/** Format a retrieval score for the debug table ('—' when the chunk was not in that list). */
const fmtScore = (n?: number): string => (n == null ? '—' : n.toFixed(4));

const TYPING_MS_PER_CHAR = 22;
const TYPING_CHARS_PER_TICK = 2;
/** Catch-up: reveal at least backlog/15 chars per tick so display speed is
 * never slower than the network stream (was hard-capped at ~91 chars/s). */
const TYPING_CATCHUP_DIVISOR = 15;

interface MessageBubbleProps {
  message: Message;
  /** Passed only to the last assistant message — shows Regenerate button */
  onRegenerate?: () => void;
  /** Opens the citation PDF viewer for a source. */
  onOpenSource?: (source: ChatSource) => void;
  /** Pins this answer to the Knowledge Garden. Shown for completed AI messages. */
  onPin?: () => Promise<void>;
  /** Creates a public share link for this answer. Shown for completed AI messages. */
  onShare?: () => Promise<void>;
}

const MessageBubble = memo(function MessageBubble({ message, onRegenerate, onOpenSource, onPin, onShare }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const showSourcesUnderAnswers = usePreferencesStore((s) => s.showSourcesUnderAnswers);
  const enableAnimations = usePreferencesStore((s) => s.enableAnimations);
  const typewriterEffect = usePreferencesStore((s) => s.typewriterEffect);

  const [visibleLength, setVisibleLength] = useState(0);
  const [copied, setCopied] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [pinning, setPinning] = useState(false);
  const [sharing, setSharing] = useState(false);
  const typewriterIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const contentLengthRef = useRef(message.content.length);
  const prevMessageIdRef = useRef(message.id);
  contentLengthRef.current = message.content.length;

  // Backward-compat: treat messages with known error prefixes as errors too
  const isError =
    message.isError ||
    message.content.startsWith('Sorry, something went wrong') ||
    message.content.startsWith('Request timed out');

  const showSources = !isUser && showSourcesUnderAnswers && message.sources && message.sources.length > 0;
  const debug = !isUser && !message.isStreaming ? message.debug : undefined;
  const timingChips = debug
    ? [
        { label: 'embed', value: debug.timings.embedMs },
        { label: 'retrieve', value: debug.timings.retrievalMs },
        ...(debug.timings.llmFirstTokenMs != null
          ? [{ label: 'ttft', value: debug.timings.llmFirstTokenMs }]
          : []),
        { label: 'total', value: debug.timings.totalMs },
      ]
    : [];
  // Marker order ([1], [2], ...) so cards match the inline citations.
  const { sorted: sortedSources, byMarker: sourceByMarker } = citationIndex(
    showSources ? message.sources! : [],
  );

  // Inline [n] markers: turn known citation numbers into internal #cite links
  // (rendered as chips below); unknown numbers stay plain text. With sources
  // hidden, markers are stripped entirely.
  const displayContent = isUser
    ? message.content
    : linkifyCitations(message.content, sourceByMarker, showSourcesUnderAnswers);

  const flashCard = (marker: number) => {
    const el = document.getElementById(`cite-card-${message.id}-${marker}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    el.classList.remove('cite-card-flash');
    void el.offsetWidth; // restart the animation
    el.classList.add('cite-card-flash');
  };

  // Reset visible length when switching to a different message
  useEffect(() => {
    if (message.id !== prevMessageIdRef.current) {
      prevMessageIdRef.current = message.id;
      if (message.isStreaming) setVisibleLength(0);
      else setVisibleLength(message.content.length);
    }
  }, [message.id, message.isStreaming, message.content.length]);

  // When streaming ends, show full content immediately
  useEffect(() => {
    if (!message.isStreaming) {
      if (typewriterIntervalRef.current) {
        clearInterval(typewriterIntervalRef.current);
        typewriterIntervalRef.current = null;
      }
      setVisibleLength(message.content.length);
    }
  }, [message.isStreaming, message.content.length]);

  // Typewriter: animate visible length toward current content length while streaming
  useEffect(() => {
    if (isUser || !message.isStreaming || !typewriterEffect) return;

    const tick = () => {
      setVisibleLength((prev) => {
        const len = contentLengthRef.current;
        const step = Math.max(
          TYPING_CHARS_PER_TICK,
          Math.ceil((len - prev) / TYPING_CATCHUP_DIVISOR),
        );
        const next = Math.min(prev + step, len);
        if (next >= len && typewriterIntervalRef.current) {
          clearInterval(typewriterIntervalRef.current);
          typewriterIntervalRef.current = null;
        }
        return next;
      });
    };

    if (visibleLength < contentLengthRef.current) {
      typewriterIntervalRef.current = setInterval(tick, TYPING_MS_PER_CHAR);
    }

    return () => {
      if (typewriterIntervalRef.current) {
        clearInterval(typewriterIntervalRef.current);
        typewriterIntervalRef.current = null;
      }
    };
  }, [isUser, message.isStreaming, message.content, typewriterEffect]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable — silently ignore
    }
  }, [message.content]);

  const handlePin = useCallback(async () => {
    if (!onPin || pinning || pinned) return;
    setPinning(true);
    try {
      await onPin();
      setPinned(true);
    } catch {
      // Error toast is shown by the onPin handler
    } finally {
      setPinning(false);
    }
  }, [onPin, pinning, pinned]);

  const handleShare = useCallback(async () => {
    if (!onShare || sharing) return;
    setSharing(true);
    try {
      await onShare();
    } catch {
      // Error toast is shown by the onShare handler
    } finally {
      setSharing(false);
    }
  }, [onShare, sharing]);

  const Wrapper = enableAnimations ? motion.div : 'div';
  const wrapperProps = enableAnimations
    ? { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.3 } }
    : {};

  const streamingText = message.isStreaming
    ? (typewriterEffect ? message.content.slice(0, visibleLength) : message.content)
    : '';

  // Action toolbar shown below AI messages after streaming completes
  const showToolbar = !isUser && !message.isStreaming;

  return (
    <Wrapper
      {...wrapperProps}
      role="article"
      aria-label={isUser ? 'Your message' : 'AI response'}
      className={cn('flex gap-3 group', isUser && 'flex-row-reverse')}
    >
      {/* Avatar — decorative only */}
      <div
        aria-hidden="true"
        className={cn(
          'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5',
          isUser ? 'bg-primary/20' : isError ? 'bg-destructive/10' : 'bg-secondary',
        )}
      >
        {isUser ? (
          <User className="w-4 h-4 text-primary" />
        ) : isError ? (
          <AlertCircle className="w-4 h-4 text-destructive" />
        ) : (
          <Bot className="w-4 h-4 text-foreground" />
        )}
      </div>

      {/* Message + toolbar */}
      <div className={cn('flex flex-col gap-1', isUser ? 'items-end' : 'items-start', 'max-w-[80%]')}>
        {/* Message content bubble */}
        <div
          className={cn(
            'rounded-2xl px-4 py-3 w-full',
            isUser ? 'message-user' : 'message-ai',
            isError && 'border border-destructive/30 bg-destructive/5',
          )}
        >
          <div className="prose prose-invert prose-sm max-w-none">
            {message.isStreaming ? (
              <p className="mb-0 whitespace-pre-wrap break-words inline">
                {streamingText}
                <span className="streaming-cursor" aria-hidden />
              </p>
            ) : (
              <ReactMarkdown
                components={{
                  ...chatMarkdownComponents,
                  a: makeCiteAnchor({ sourceByMarker, onChipClick: flashCard }),
                }}
              >
                {displayContent}
              </ReactMarkdown>
            )}
          </div>

          {showSources && (
            <div className="mt-3 pt-3 border-t border-border/50" role="complementary" aria-label="Source passages">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Sources
              </p>
              <div className="flex flex-col gap-1.5">
                {sortedSources.map((src, i) => {
                  const marker = src.marker ?? i + 1;
                  const cleaned = (src.snippet ?? '').replace(/\s+/g, ' ').trim();
                  return (
                    <button
                      key={`${src.documentId ?? 'doc'}-${marker}`}
                      type="button"
                      id={`cite-card-${message.id}-${marker}`}
                      onClick={() => onOpenSource?.(src)}
                      className="flex items-start gap-2 rounded-lg bg-muted/30 hover:bg-muted/60 transition-colors px-2.5 py-2 text-xs text-left w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={`Open source ${marker} in the PDF viewer`}
                    >
                      <span className="shrink-0 mt-0.5 font-mono text-[10px] font-semibold text-primary bg-primary/15 rounded px-1.5 py-0.5 leading-none">
                        {marker}
                      </span>
                      <span className="flex-1 min-w-0">
                        {src.documentName && (
                          <span className="block truncate text-[10px] font-medium text-foreground/80">
                            {src.documentName}
                          </span>
                        )}
                        <span className="block text-[10px] font-medium text-foreground/70 mb-0.5">
                          {pageLabel(src)}
                        </span>
                        <span className="block text-muted-foreground leading-relaxed line-clamp-2">
                          {cleaned || `Passage ${src.chunkIndex + 1}`}
                        </span>
                      </span>
                      <span
                        className="shrink-0 text-[10px] tabular-nums text-muted-foreground/60 self-start mt-0.5"
                        title={`Relevance: ${Math.round(src.score * 100)}%`}
                      >
                        {Math.round(src.score * 100)}%
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {debug && (
            <div className="mt-3 pt-3 border-t border-border/50" role="complementary" aria-label="Retrieval details">
              <button
                type="button"
                onClick={() => setDebugOpen((o) => !o)}
                aria-expanded={debugOpen}
                className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors"
              >
                {debugOpen ? (
                  <ChevronDown className="w-3 h-3" aria-hidden="true" />
                ) : (
                  <ChevronRight className="w-3 h-3" aria-hidden="true" />
                )}
                Retrieval details
              </button>

              {debugOpen && (
                <div className="mt-2 flex flex-col gap-2">
                  {/* Cache status + timing chips */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={cn(
                        'rounded px-1.5 py-0.5 text-[10px] font-mono font-semibold leading-none',
                        debug.cacheStatus === 'miss'
                          ? 'bg-muted/50 text-muted-foreground'
                          : 'bg-primary/10 text-primary',
                      )}
                    >
                      cache: {debug.cacheStatus}
                      {debug.semanticSimilarity != null &&
                        ` (${(debug.semanticSimilarity * 100).toFixed(1)}%)`}
                    </span>
                    {timingChips.map((chip) => (
                      <span
                        key={chip.label}
                        className="rounded bg-muted/50 px-1.5 py-0.5 text-[10px] font-mono tabular-nums text-muted-foreground leading-none"
                      >
                        {chip.label}: {Math.round(chip.value)}ms
                      </span>
                    ))}
                    <span className="rounded bg-muted/50 px-1.5 py-0.5 text-[10px] font-mono tabular-nums text-muted-foreground leading-none">
                      topK: {debug.topK}
                    </span>
                  </div>

                  {/* Candidate table — scrolls inside its own container on mobile */}
                  {debug.candidates.length > 0 && (
                    <div className="overflow-x-auto rounded-lg border border-border/50">
                      <table className="w-full min-w-[420px] text-[11px] font-mono tabular-nums">
                        <thead>
                          <tr className="border-b border-border/50 text-left text-muted-foreground">
                            <th className="px-2 py-1.5 font-medium">chunk</th>
                            <th className="px-2 py-1.5 font-medium text-right">dense</th>
                            <th className="px-2 py-1.5 font-medium text-right">lexical</th>
                            <th className="px-2 py-1.5 font-medium text-right">rrf</th>
                            <th className="px-2 py-1.5 font-medium text-center">kept</th>
                            <th className="px-2 py-1.5 font-medium text-center">in&nbsp;prompt</th>
                            <th className="px-2 py-1.5 font-medium text-right">cite</th>
                          </tr>
                        </thead>
                        <tbody>
                          {debug.candidates.map((c) => (
                            <tr
                              key={`${c.documentId ?? 'doc'}-${c.chunkIndex}`}
                              className={cn(
                                'border-b border-border/30 last:border-b-0',
                                !c.retained && 'text-muted-foreground/50',
                              )}
                            >
                              <td className="px-2 py-1">§{c.chunkIndex + 1}</td>
                              <td className="px-2 py-1 text-right">{fmtScore(c.denseScore)}</td>
                              <td className="px-2 py-1 text-right">{fmtScore(c.lexicalScore)}</td>
                              <td className="px-2 py-1 text-right">{c.rrfScore.toFixed(4)}</td>
                              <td className={cn('px-2 py-1 text-center', c.retained && 'text-green-400')}>
                                {c.retained ? '✓' : '—'}
                              </td>
                              <td className={cn('px-2 py-1 text-center', c.included && 'text-green-400')}>
                                {c.included ? '✓' : '—'}
                              </td>
                              <td className="px-2 py-1 text-right text-muted-foreground">
                                {c.marker != null ? `[${c.marker}]` : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Action toolbar — appears on hover for AI messages, always shown for errors */}
        {showToolbar && (
          <div
            className={cn(
              'flex items-center gap-0.5 transition-opacity duration-150',
              isError ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100',
            )}
            role="toolbar"
            aria-label="Message actions"
          >
            {/* Copy */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  onClick={handleCopy}
                  aria-label={copied ? 'Copied!' : 'Copy response'}
                >
                  {copied ? (
                    <Check className="w-3.5 h-3.5 text-green-400" aria-hidden="true" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{copied ? 'Copied!' : 'Copy'}</TooltipContent>
            </Tooltip>

            {/* Pin to Knowledge Garden */}
            {onPin && !isError && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      'h-7 w-7 text-muted-foreground hover:text-foreground',
                      pinned && 'text-primary hover:text-primary',
                    )}
                    onClick={handlePin}
                    disabled={pinning || pinned}
                    aria-label={pinned ? 'Pinned to garden' : 'Pin to garden'}
                  >
                    <Pin
                      className={cn('w-3.5 h-3.5', pinned && 'fill-current')}
                      aria-hidden="true"
                    />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {pinned ? 'Pinned to garden' : 'Pin to garden'}
                </TooltipContent>
              </Tooltip>
            )}

            {/* Share — public link to this answer */}
            {onShare && !isError && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={handleShare}
                    disabled={sharing}
                    aria-label="Share this answer"
                  >
                    <Share2 className="w-3.5 h-3.5" aria-hidden="true" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {sharing ? 'Creating link…' : 'Share (copy public link)'}
                </TooltipContent>
              </Tooltip>
            )}

            {/* Regenerate / Retry */}
            {onRegenerate && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      'h-7 w-7 text-muted-foreground hover:text-foreground',
                      isError && 'text-destructive/70 hover:text-destructive',
                    )}
                    onClick={onRegenerate}
                    aria-label={isError ? 'Retry' : 'Regenerate response'}
                  >
                    {isError ? (
                      <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                    ) : (
                      <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{isError ? 'Retry' : 'Regenerate'}</TooltipContent>
              </Tooltip>
            )}
          </div>
        )}
      </div>
    </Wrapper>
  );
});

export default MessageBubble;
