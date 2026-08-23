import { memo, useState, useEffect, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Message, type ChatSource } from '@/stores/useAppStore';
import { usePreferencesStore } from '@/stores/usePreferencesStore';
import { Bot, User, Copy, Check, RefreshCw, RotateCcw, AlertCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

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
}

const MessageBubble = memo(function MessageBubble({ message, onRegenerate, onOpenSource }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const showSourcesUnderAnswers = usePreferencesStore((s) => s.showSourcesUnderAnswers);
  const enableAnimations = usePreferencesStore((s) => s.enableAnimations);
  const typewriterEffect = usePreferencesStore((s) => s.typewriterEffect);

  const [visibleLength, setVisibleLength] = useState(0);
  const [copied, setCopied] = useState(false);
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
  // Marker order ([1], [2], ...) so cards match the inline citations.
  const sortedSources = showSources
    ? [...message.sources!].sort(
        (a, b) => (a.marker ?? a.chunkIndex + 1) - (b.marker ?? b.chunkIndex + 1),
      )
    : [];
  const sourceByMarker = new Map(
    sortedSources.map((src, i) => [src.marker ?? i + 1, src]),
  );

  // Inline [n] markers: turn known citation numbers into internal #cite links
  // (rendered as chips below); unknown numbers stay plain text. With sources
  // hidden, markers are stripped entirely.
  const displayContent = isUser
    ? message.content
    : message.content.replace(/\[(\d{1,2})\](?!\()/g, (full, num: string) => {
        const n = parseInt(num, 10);
        if (!sourceByMarker.has(n)) return full;
        if (!showSourcesUnderAnswers) return '';
        return `[${n}](#cite-${n})`;
      });

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
                  a: ({ href, children, ...props }) => {
                    const cite = href?.startsWith('#cite-')
                      ? parseInt(href.slice(6), 10)
                      : NaN;
                    if (!Number.isNaN(cite) && sourceByMarker.has(cite)) {
                      return (
                        <button
                          type="button"
                          onClick={() => flashCard(cite)}
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
                  },
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
                      key={marker}
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
                        <span className="block text-[10px] font-medium text-foreground/70 mb-0.5">
                          {src.pageStart != null
                            ? src.pageStart === src.pageEnd || src.pageEnd == null
                              ? `Page ${src.pageStart}`
                              : `Pages ${src.pageStart}–${src.pageEnd}`
                            : 'Page unknown — reprocess for precise citations'}
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
