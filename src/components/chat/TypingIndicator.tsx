import { motion } from 'framer-motion';

const TypingIndicator = () => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="flex gap-3"
    >
      <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
        <svg
          className="w-4 h-4 text-foreground"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M12 2a10 10 0 1 0 10 10H12V2Z" />
          <path d="M12 12 2.1 7.1" />
        </svg>
      </div>
      <div className="message-ai rounded-2xl px-4 py-3">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-muted-foreground typing-dot" />
          <div className="w-2 h-2 rounded-full bg-muted-foreground typing-dot" />
          <div className="w-2 h-2 rounded-full bg-muted-foreground typing-dot" />
        </div>
      </div>
    </motion.div>
  );
};

export default TypingIndicator;
