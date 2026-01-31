import { memo, useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Message } from '@/stores/useAppStore';
import { usePreferencesStore } from '@/stores/usePreferencesStore';
import { Bot, User } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { motion } from 'framer-motion';

const TYPING_MS_PER_CHAR = 22;
const TYPING_CHARS_PER_TICK = 2;

interface MessageBubbleProps {
  message: Message;
}

const MessageBubble = memo(function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const showSourcesUnderAnswers = usePreferencesStore((s) => s.showSourcesUnderAnswers);
  const enableAnimations = usePreferencesStore((s) => s.enableAnimations);

  const [visibleLength, setVisibleLength] = useState(0);
  const typewriterIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const contentLengthRef = useRef(message.content.length);
  const prevMessageIdRef = useRef(message.id);
  contentLengthRef.current = message.content.length;

  const showSources = !isUser && showSourcesUnderAnswers && message.sources && message.sources.length > 0;
  const chunkIndices = showSources
    ? message.sources!.map((s) => s.chunkIndex).sort((a, b) => a - b)
    : [];

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
    if (isUser || !message.isStreaming) return;

    const tick = () => {
      setVisibleLength((prev) => {
        const len = contentLengthRef.current;
        const next = Math.min(prev + TYPING_CHARS_PER_TICK, len);
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
  }, [isUser, message.isStreaming, message.content]);

  const Wrapper = enableAnimations ? motion.div : 'div';
  const wrapperProps = enableAnimations
    ? { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.3 } }
    : {};

  const streamingText = message.isStreaming ? message.content.slice(0, visibleLength) : '';

  return (
    <Wrapper
      {...wrapperProps}
      className={cn('flex gap-3', isUser && 'flex-row-reverse')}
    >
      {/* Avatar */}
      <div
        className={cn(
          'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
          isUser ? 'bg-primary/20' : 'bg-secondary'
        )}
      >
        {isUser ? (
          <User className="w-4 h-4 text-primary" />
        ) : (
          <Bot className="w-4 h-4 text-foreground" />
        )}
      </div>

      {/* Message content */}
      <div
        className={cn(
          'max-w-[80%] rounded-2xl px-4 py-3',
          isUser ? 'message-user' : 'message-ai'
        )}
      >
        <div className="prose prose-invert prose-sm max-w-none">
          {message.isStreaming ? (
            /* Typewriter: reveal text char-by-char with cursor following */
            <p className="mb-0 whitespace-pre-wrap break-words inline">
              {streamingText}
              <span className="streaming-cursor" aria-hidden />
            </p>
          ) : (
            <ReactMarkdown
              components={{
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
              {message.content}
            </ReactMarkdown>
          )}
        </div>
        {showSources && (
          <p className="mt-3 pt-3 border-t border-border/50 text-muted-foreground text-xs">
            Sources (chunk indices): {chunkIndices.join(', ')}
          </p>
        )}
      </div>
    </Wrapper>
  );
});

export default MessageBubble;
