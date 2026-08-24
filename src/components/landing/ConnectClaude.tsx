import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Copy, Terminal } from 'lucide-react';
import { getApiBaseUrl } from '@/lib/api';

type TabId = 'claude-ai' | 'claude-code' | 'claude-desktop';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'claude-ai', label: 'claude.ai' },
  { id: 'claude-code', label: 'Claude Code' },
  { id: 'claude-desktop', label: 'Claude Desktop' },
];

interface CopyButtonProps {
  text: string;
  label: string;
}

const CopyButton = ({ text, label }: CopyButtonProps) => {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      /* clipboard unavailable (e.g. insecure context) — nothing to do */
    }
  };

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      aria-label={copied ? 'Copied' : label}
      className="shrink-0 p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
    >
      {copied ? (
        <Check className="w-4 h-4 text-primary" aria-hidden="true" />
      ) : (
        <Copy className="w-4 h-4" aria-hidden="true" />
      )}
    </button>
  );
};

interface CodeBlockProps {
  code: string;
  copyLabel: string;
}

/** Mono code row/block; wide content scrolls in its own overflow container. */
const CodeBlock = ({ code, copyLabel }: CodeBlockProps) => (
  <div className="flex items-start gap-2 rounded-lg border border-border bg-background/60 p-3">
    <pre className="flex-1 min-w-0 overflow-x-auto font-mono text-xs sm:text-sm text-foreground/90 leading-relaxed">
      <code>{code}</code>
    </pre>
    <CopyButton text={code} label={copyLabel} />
  </div>
);

const ConnectClaude = () => {
  const [tab, setTab] = useState<TabId>('claude-ai');
  const apiBase = getApiBaseUrl() ?? 'https://your-backend-url';
  const mcpUrl = `${apiBase}/mcp`;

  // Support /#connect-claude deep links: the SPA renders after the browser's
  // native hash scroll attempt, so scroll once the section exists.
  useEffect(() => {
    if (window.location.hash === '#connect-claude') {
      document
        .getElementById('connect-claude')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  const desktopConfig = [
    '{',
    '  "mcpServers": {',
    '    "documind": {',
    '      "command": "npx",',
    '      "args": [',
    '        "-y", "mcp-remote",',
    `        "${mcpUrl}",`,
    '        "--header", "Authorization: Bearer YOUR_DM_TOKEN"',
    '      ]',
    '    }',
    '  }',
    '}',
  ].join('\n');

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
              documind — mcp
            </span>
          </div>

          {/* Tab row */}
          <div className="flex border-b border-border bg-background/20 overflow-x-auto" role="tablist" aria-label="Connection method">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`shrink-0 px-4 py-2.5 font-mono text-xs sm:text-sm transition-colors border-b-2 -mb-px ${
                  tab === t.id
                    ? 'text-primary border-primary bg-primary/5'
                    : 'text-muted-foreground border-transparent hover:text-foreground'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="p-4 sm:p-6 space-y-4">
            {tab === 'claude-ai' && (
              <>
                <ol className="space-y-2 text-sm text-muted-foreground">
                  <li>
                    <span className="font-mono text-primary mr-2">1.</span>
                    Open <span className="text-foreground">Settings → Connectors</span> on claude.ai.
                  </li>
                  <li>
                    <span className="font-mono text-primary mr-2">2.</span>
                    Choose <span className="text-foreground">Add custom connector</span>.
                  </li>
                  <li>
                    <span className="font-mono text-primary mr-2">3.</span>
                    Paste the connector URL below and authorize with your{' '}
                    <span className="font-mono text-foreground">dm_</span> token.
                  </li>
                </ol>
                <CodeBlock code={mcpUrl} copyLabel="Copy connector URL" />
              </>
            )}

            {tab === 'claude-code' && (
              <>
                <p className="text-sm text-muted-foreground">
                  One command in your terminal:
                </p>
                <CodeBlock
                  code={`claude mcp add --transport http documind ${mcpUrl} --header "Authorization: Bearer YOUR_DM_TOKEN"`}
                  copyLabel="Copy Claude Code command"
                />
                <p className="text-xs text-muted-foreground">
                  Replace <span className="font-mono text-foreground">YOUR_DM_TOKEN</span> with
                  an API token from Settings — it is sent as the{' '}
                  <span className="font-mono">Authorization</span> header on every request.
                </p>
              </>
            )}

            {tab === 'claude-desktop' && (
              <>
                <p className="text-sm text-muted-foreground">
                  Add DocuMind to{' '}
                  <span className="font-mono text-foreground">claude_desktop_config.json</span>:
                </p>
                <CodeBlock code={desktopConfig} copyLabel="Copy Claude Desktop config" />
                <p className="text-xs text-muted-foreground">
                  Replace <span className="font-mono text-foreground">YOUR_DM_TOKEN</span> with
                  an API token from Settings, then restart Claude Desktop.
                </p>
              </>
            )}
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default ConnectClaude;
