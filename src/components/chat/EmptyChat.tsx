import { motion } from 'framer-motion';
import { MessageSquare } from 'lucide-react';

const SUGGESTIONS = [
  'What is the main topic of this document?',
  'Summarize the key points',
  'Summarize section 3',
  'What risks are mentioned?',
];

interface EmptyChatProps {
  onPromptClick?: (question: string) => void;
}

const EmptyChat = ({ onPromptClick }: EmptyChatProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4 }}
      className="flex-1 flex items-center justify-center p-8"
    >
      <div className="text-center max-w-md">
        {/* Animated icon */}
        <motion.div
          animate={{
            y: [0, -10, 0],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6"
        >
          <MessageSquare className="w-10 h-10 text-primary" />
        </motion.div>

        <h2 className="text-xl sm:text-2xl font-semibold mb-3">Start a conversation</h2>
        <p className="text-muted-foreground text-mobile-safe mb-6">
          Ask anything about your document. Answers are grounded in the content you uploaded—no guessing.
        </p>

        {/* Suggestions */}
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground mb-3">Try asking:</p>
          <div className="flex flex-wrap gap-2 justify-center">
            {SUGGESTIONS.map((question, i) => (
              <motion.button
                key={question}
                type="button"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + i * 0.1 }}
                onClick={() => onPromptClick?.(question)}
                className="min-h-touch px-4 py-3 rounded-lg bg-secondary text-mobile-safe text-left cursor-pointer hover:bg-secondary/80 active:bg-secondary/90 transition-colors border-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring touch-manipulation"
              >
                &ldquo;{question}&rdquo;
              </motion.button>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default EmptyChat;
