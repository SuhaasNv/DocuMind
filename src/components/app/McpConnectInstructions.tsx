import { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { getApiBaseUrl } from '@/lib/api';

export type McpTabId = 'claude-ai' | 'claude-code' | 'claude-desktop';

export const MCP_TABS: Array<{ id: McpTabId; label: string }> = [
  { id: 'claude-ai', label: 'claude.ai' },
  { id: 'claude-code', label: 'Claude Code' },
  { id: 'claude-desktop', label: 'Claude Desktop' },
];

interface CopyButtonProps {
  text: string;
  label: string;
}

export const CopyButton = ({ text, label }: CopyButtonProps) => {
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
export const CodeBlock = ({ code, copyLabel }: CodeBlockProps) => (
  <div className="flex items-start gap-2 rounded-lg border border-border bg-background/60 p-3">
    <pre className="flex-1 min-w-0 overflow-x-auto font-mono text-xs sm:text-sm text-foreground/90 leading-relaxed">
      <code>{code}</code>
    </pre>
    <CopyButton text={code} label={copyLabel} />
  </div>
);

interface McpConnectInstructionsProps {
  /**
   * Real dm_... token to bake into the copy-paste snippets. Omit to fall
   * back to a YOUR_DM_TOKEN placeholder (e.g. general docs with no token in
   * scope yet); pass the plaintext token right after creation so the
   * snippet is paste-ready with no manual substitution.
   */
  token?: string;
  defaultTab?: McpTabId;
  /** Hide the tab row and only render one method — used in the one-time token dialog. */
  fixedTab?: McpTabId;
  className?: string;
}

/**
 * The three ways to connect Claude to this DocuMind account's MCP server
 * (claude.ai custom connector, Claude Code, Claude Desktop). Shared by the
 * landing page's "Connect Claude" section and Settings, so the setup steps
 * never drift between the two.
 */
const McpConnectInstructions = ({
  token,
  defaultTab = 'claude-ai',
  fixedTab,
  className,
}: McpConnectInstructionsProps) => {
  const [tab, setTab] = useState<McpTabId>(fixedTab ?? defaultTab);
  const apiBase = getApiBaseUrl() ?? 'https://your-backend-url';
  const mcpUrl = `${apiBase}/mcp`;
  const dmToken = token ?? 'YOUR_DM_TOKEN';
  const activeTab = fixedTab ?? tab;

  const desktopConfig = [
    '{',
    '  "mcpServers": {',
    '    "documind": {',
    '      "command": "npx",',
    '      "args": [',
    '        "-y", "mcp-remote",',
    `        "${mcpUrl}",`,
    `        "--header", "Authorization: Bearer ${dmToken}"`,
    '      ]',
    '    }',
    '  }',
    '}',
  ].join('\n');

  return (
    <div className={className}>
      <div className="mb-4">
        <p className="text-xs font-medium text-muted-foreground mb-1.5">MCP Server URL</p>
        <CodeBlock code={mcpUrl} copyLabel="Copy MCP server URL" />
      </div>

      {!fixedTab && (
        <div
          className="flex border-b border-border overflow-x-auto mb-4"
          role="tablist"
          aria-label="Connection method"
        >
          {MCP_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`shrink-0 px-4 py-2 font-mono text-xs sm:text-sm transition-colors border-b-2 -mb-px ${
                tab === t.id
                  ? 'text-primary border-primary'
                  : 'text-muted-foreground border-transparent hover:text-foreground'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-4">
        {activeTab === 'claude-ai' && (
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
                Paste the connector URL above and authorize with your{' '}
                <span className="font-mono text-foreground">dm_</span> token.
              </li>
            </ol>
            {token && (
              <CodeBlock code={token} copyLabel="Copy API token" />
            )}
          </>
        )}

        {activeTab === 'claude-code' && (
          <>
            <p className="text-sm text-muted-foreground">One command in your terminal:</p>
            <CodeBlock
              code={`claude mcp add --transport http documind ${mcpUrl} --header "Authorization: Bearer ${dmToken}"`}
              copyLabel="Copy Claude Code command"
            />
            {!token && (
              <p className="text-xs text-muted-foreground">
                Replace <span className="font-mono text-foreground">YOUR_DM_TOKEN</span> with
                an API token from Settings. It is sent as the{' '}
                <span className="font-mono">Authorization</span> header on every request.
              </p>
            )}
          </>
        )}

        {activeTab === 'claude-desktop' && (
          <>
            <p className="text-sm text-muted-foreground">
              Add DocuMind to{' '}
              <span className="font-mono text-foreground">claude_desktop_config.json</span>:
            </p>
            <CodeBlock code={desktopConfig} copyLabel="Copy Claude Desktop config" />
            {!token && (
              <p className="text-xs text-muted-foreground">
                Replace <span className="font-mono text-foreground">YOUR_DM_TOKEN</span> with
                an API token from Settings, then restart Claude Desktop.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default McpConnectInstructions;
