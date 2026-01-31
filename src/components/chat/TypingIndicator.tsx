import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';

const TypingIndicator = () => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="flex gap-3"
    >
      <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
        <Sparkles className="w-4 h-4 text-primary" />
      </div>
      <div className="message-ai rounded-2xl px-4 py-3 min-w-[140px]">
        <p className="text-sm text-muted-foreground font-medium mb-2">Thinking...</p>
        <div
          className="h-1.5 rounded-full w-full max-w-[120px] overflow-hidden shimmer-thinking-bar"
          aria-hidden
        />
      </div>
    </motion.div>
  );
};

export default TypingIndicator;
