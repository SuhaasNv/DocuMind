import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Terminal } from 'lucide-react';
import McpConnectInstructions from '@/components/app/McpConnectInstructions';

const ConnectClaude = () => {
  // Support /#connect-claude deep links: the SPA renders after the browser's
  // native hash scroll attempt, so scroll once the section exists.
  useEffect(() => {
    if (window.location.hash === '#connect-claude') {
      document
        .getElementById('connect-claude')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  return (
    <section id="connect-claude" className="py-16 sm:py-20 md:py-24 relative">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/5 to-transparent" />

      <div className="relative z-10 container mx-auto px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-10 sm:mb-14"
        >
          <p className="font-mono text-[11px] sm:text-xs uppercase tracking-[0.35em] text-primary mb-3">
            Connect Claude
          </p>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-3 sm:mb-4 leading-tight">
            Your documents,
            <span className="gradient-text"> inside Claude</span>
          </h2>
          <p className="text-muted-foreground text-sm sm:text-base md:text-lg max-w-2xl mx-auto">
            DocuMind ships an MCP server. Create an API token in Settings, then
            let Claude list, search, and ask your documents from anywhere.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="max-w-3xl mx-auto rounded-2xl glass-card overflow-hidden"
        >
          {/* Terminal chrome */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-background/40">
            <span className="w-2.5 h-2.5 rounded-full bg-muted" aria-hidden="true" />
            <span className="w-2.5 h-2.5 rounded-full bg-muted" aria-hidden="true" />
            <span className="w-2.5 h-2.5 rounded-full bg-primary/60" aria-hidden="true" />
            <span className="ml-2 flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
              <Terminal className="w-3.5 h-3.5" aria-hidden="true" />
              documind, mcp
            </span>
          </div>

          <div className="p-4 sm:p-6">
            <McpConnectInstructions />
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default ConnectClaude;
