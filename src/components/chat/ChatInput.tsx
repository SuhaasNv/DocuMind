import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Loader2, Square, Clock, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { DocumentStatus } from '@/stores/useAppStore';

interface ChatInputProps {
  onSend: (message: string) => void;
  onStop?: () => void;
  isLoading?: boolean;
  disabled?: boolean;
  documentStatus?: DocumentStatus;
}

const STATUS_MESSAGES: Partial<Record<DocumentStatus, { icon: React.ElementType; text: string; className: string }>> = {
  PENDING: {
    icon: Clock,
    text: 'Queued for processing — chat will be available shortly.',
    className: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
  },
  PROCESSING: {
    icon: Loader2,
    text: 'Processing document — almost ready…',
    className: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  },
  FAILED: {
    icon: AlertCircle,
    text: 'Document processing failed. Please try uploading again.',
    className: 'text-destructive bg-destructive/10 border-destructive/20',
  },
};

const ChatInput = ({
  onSend,
  onStop,
  isLoading = false,
  disabled = false,
  documentStatus,
}: ChatInputProps) => {
  const [message, setMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim() && !isLoading && !disabled) {
      onSend(message.trim());
      setMessage('');
      // Retain focus so the user can immediately type the next message
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === 'Enter' && !e.shiftKey) || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  // Auto-resize textarea (but keep max height)
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = '24px';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [message]);

  const statusInfo = disabled && documentStatus ? STATUS_MESSAGES[documentStatus] : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="border-t border-border bg-background/80 backdrop-blur-lg p-4 shadow-[0_-4px_16px_rgba(0,0,0,0.12)]"
    >
      {/* Processing status banner */}
      <AnimatePresence>
        {statusInfo && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="max-w-4xl mx-auto mb-3 overflow-hidden"
          >
            <div
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium',
                statusInfo.className,
              )}
              role="status"
              aria-live="polite"
            >
              <statusInfo.icon
                className={cn('w-3.5 h-3.5 shrink-0', documentStatus === 'PROCESSING' && 'animate-spin')}
                aria-hidden="true"
              />
              {statusInfo.text}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
        <div className="relative flex items-center gap-3">
          <div className="flex-1 relative flex items-center min-h-12">
            <textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                disabled
                  ? 'Chat will be available once the document is ready…'
                  : 'Ask a question about your document...'
              }
              disabled={disabled || isLoading}
              rows={1}
              aria-label="Message input"
              aria-describedby="chat-input-hint"
              aria-multiline="true"
              className={cn(
                'w-full resize-none rounded-xl border border-border bg-secondary/50 px-4 py-3 min-h-12',
                'text-foreground placeholder:text-muted-foreground',
                'focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                'transition-all duration-200',
              )}
              style={{ maxHeight: '120px' }}
            />
          </div>

          {/* Send / Stop button — morphs based on streaming state */}
          {isLoading ? (
            <Button
              type="button"
              size="icon"
              variant="destructive"
              onClick={onStop}
              className="h-12 w-12 rounded-xl flex-shrink-0 self-center"
              aria-label="Stop generating"
            >
              <Square className="w-4 h-4 fill-current" aria-hidden="true" />
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon"
              disabled={!message.trim() || disabled}
              className="h-12 w-12 rounded-xl flex-shrink-0 self-center"
              aria-label="Send message"
            >
              <Send className="w-5 h-5" aria-hidden="true" />
            </Button>
          )}
        </div>

        <p id="chat-input-hint" className="text-xs text-muted-foreground text-center mt-3">
          {isLoading
            ? 'Generating response — press Stop to cancel.'
            : 'AI responses are grounded in your document. Press Enter to send · Shift+Enter for new line.'}
        </p>
      </form>
    </motion.div>
  );
};

export default ChatInput;
