import { memo } from 'react';
import { cn } from '@/lib/utils';
import { Message } from '@/stores/useAppStore';
import { usePreferencesStore } from '@/stores/usePreferencesStore';
import { Bot, User } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { motion } from 'framer-motion';

interface MessageBubbleProps {
  message: Message;
}

const MessageBubble = memo(function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const showSourcesUnderAnswers = usePreferencesStore((s) => s.showSourcesUnderAnswers);
  const enableAnimations = usePreferencesStore((s) => s.enableAnimations);

  const showSources = !isUser && showSourcesUnderAnswers && message.sources && message.sources.length > 0;
  const chunkIndices = showSources
    ? message.sources!.map((s) => s.chunkIndex).sort((a, b) => a - b)
    : [];

  const Wrapper = enableAnimations ? motion.div : 'div';
  const wrapperProps = enableAnimations
    ? { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.3 } }
    : {};

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

      {/* Message content - no fixed heights, wrap cleanly */}
      <div
        className={cn(
          'max-w-[85%] sm:max-w-[80%] rounded-2xl px-4 py-3 min-w-0',
          isUser ? 'message-user' : 'message-ai'
        )}
      >
        <div className="prose prose-invert prose-sm max-w-none text-mobile-safe [&>*]:break-words">
          {message.isStreaming ? (
            /* While streaming: render text + cursor inline so cursor stays at end of text */
            <p className="mb-0 whitespace-pre-wrap break-words">
              {message.content}
              <span className="streaming-cursor" />
            </p>
          ) : (
            <ReactMarkdown
              components={{
                code: ({ className, children, ...props }) => {
                  const match = /language-(\w+)/.exec(className || '');
                  const isInline = !match;
                  return isInline ? (
                    <code
                      className="px-1.5 py-0.5 rounded bg-muted text-primary text-sm font-mono break-all"
                      {...props}
                    >
                      {children}
                    </code>
                  ) : (
                    <pre className="bg-muted/50 rounded-lg p-4 overflow-x-auto my-3 max-w-full text-sm sm:text-base font-mono">
                      <code className="text-foreground break-words" {...props}>
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
          <p className="mt-3 pt-3 border-t border-border/50 text-muted-foreground text-mobile-safe text-sm">
            Sources (chunk indices): {chunkIndices.join(', ')}
          </p>
        )}
      </div>
    </Wrapper>
  );
});

export default MessageBubble;
