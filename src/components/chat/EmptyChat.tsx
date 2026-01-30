import { motion } from 'framer-motion';
import { MessageSquare } from 'lucide-react';

const EmptyChat = () => {
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

        <h2 className="text-2xl font-semibold mb-3">Start a Conversation</h2>
        <p className="text-muted-foreground mb-6">
          Ask a question to begin chatting with your document. The AI will provide answers grounded in the content you uploaded.
        </p>

        {/* Suggestions */}
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground mb-3">Try asking:</p>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="inline-block px-4 py-2 rounded-lg bg-secondary text-sm cursor-pointer hover:bg-secondary/80 transition-colors"
          >
            "What are the main topics covered?"
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="inline-block px-4 py-2 rounded-lg bg-secondary text-sm cursor-pointer hover:bg-secondary/80 transition-colors ml-2"
          >
            "Summarize the key points"
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
};

export default EmptyChat;
