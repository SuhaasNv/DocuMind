import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ChatInputProps {
  onSend: (message: string) => void;
  isLoading?: boolean;
  disabled?: boolean;
}

const ChatInput = ({ onSend, isLoading = false, disabled = false }: ChatInputProps) => {
  const [message, setMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim() && !isLoading && !disabled) {
      onSend(message.trim());
      setMessage('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="border-t border-border bg-background/80 backdrop-blur-lg p-4 pb-safe pl-safe pr-safe"
    >
      <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
        <div className="relative flex items-center gap-2 sm:gap-3">
          <div className="flex-1 relative flex items-center min-h-touch min-w-0">
            <textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a question about your document..."
              disabled={disabled || isLoading}
              rows={1}
              className={cn(
                'w-full resize-none rounded-xl border border-border bg-secondary/50 px-4 py-3 min-h-touch text-base min-[480px]:min-h-12',
                'text-foreground placeholder:text-muted-foreground text-mobile-safe',
                'focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                'transition-all duration-200'
              )}
              style={{ maxHeight: '120px' }}
              aria-label="Message input"
            />
          </div>

          <Button
            type="submit"
            size="icon"
            disabled={!message.trim() || isLoading || disabled}
            className="min-h-touch min-w-touch md:min-h-0 md:min-w-0 h-12 w-12 rounded-xl flex-shrink-0 self-center"
            aria-label="Send message"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </Button>
        </div>

        <p className="text-mobile-safe text-muted-foreground text-center mt-3 text-sm">
          AI responses are grounded in your document. Press Enter to send.
        </p>
      </form>
    </motion.div>
  );
};

export default ChatInput;
