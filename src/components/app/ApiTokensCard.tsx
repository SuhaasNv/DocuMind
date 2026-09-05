import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { getApiBaseUrl } from '@/lib/api';
import McpConnectInstructions from '@/components/app/McpConnectInstructions';
import { Check, Copy, KeyRound, ShieldOff } from 'lucide-react';

interface ApiTokenListItem {
  id: string;
  name: string;
  display: string;
  lastUsedAt: string | null;
  revoked: boolean;
  createdAt: string;
}

interface CreatedApiToken {
  id: string;
  name: string;
  token: string;
  last4: string;
}

interface ApiTokensCardProps {
  accessToken: string;
}

/**
 * Personal API tokens for the MCP connector: create (plaintext shown once),
 * list (name + dm_...last4 + last used), revoke with confirm.
 */
const ApiTokensCard = ({ accessToken }: ApiTokensCardProps) => {
  const [tokens, setTokens] = useState<ApiTokenListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createdToken, setCreatedToken] = useState<CreatedApiToken | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<ApiTokenListItem | null>(null);
  const [revoking, setRevoking] = useState(false);

  const base = getApiBaseUrl();

  const authHeaders = useCallback(
    (): Record<string, string> => ({ Authorization: `Bearer ${accessToken}` }),
    [accessToken],
  );

  const loadTokens = useCallback(async () => {
    if (!base) {
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`${base}/api-tokens`, { headers: authHeaders() });
      if (res.ok) {
        setTokens((await res.json()) as ApiTokenListItem[]);
      }
    } catch {
      /* transient network error — the list simply stays empty */
    } finally {
      setLoading(false);
    }
  }, [base, authHeaders]);

  useEffect(() => {
    void loadTokens();
  }, [loadTokens]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) {
      toast.error('Give the token a name');
      return;
    }
    if (!base) {
      toast.error('Backend URL is not configured');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch(`${base}/api-tokens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        setCreatedToken((await res.json()) as CreatedApiToken);
        setNewName('');
        void loadTokens();
      } else {
        const body: { message?: string | string[] } = await res
          .json()
          .catch(() => ({}));
        const msg = Array.isArray(body.message) ? body.message[0] : body.message;
        toast.error(msg || 'Failed to create token');
      }
    } catch {
      toast.error('Network error, could not reach the backend');
    } finally {
      setCreating(false);
    }
  };

  const handleConfirmRevoke = async () => {
    if (!base || !revokeTarget) return;
    setRevoking(true);
    try {
      const res = await fetch(`${base}/api-tokens/${revokeTarget.id}/revoke`, {
        method: 'POST',
        headers: authHeaders(),
      });
      if (res.ok) {
        toast.success('Token revoked');
        void loadTokens();
        setRevokeTarget(null);
      } else {
        toast.error('Failed to revoke token');
      }
    } catch {
      toast.error('Network error, could not reach the backend');
    } finally {
      setRevoking(false);
    }
  };

  const handleCopyToken = async () => {
    if (!createdToken) return;
    try {
      await navigator.clipboard.writeText(createdToken.token);
      setCopied(true);
    } catch {
      toast.error('Could not copy, select the token and copy manually');
    }
  };

  const formatDate = (iso: string | null): string =>
    iso ? new Date(iso).toLocaleDateString() : 'never';

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="w-4 h-4 text-primary" />
            API Tokens
          </CardTitle>
          <CardDescription>
            Personal tokens for the MCP connector. The full token is shown only
            once, at creation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            className="flex flex-col sm:flex-row gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void handleCreate();
            }}
          >
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Token name (e.g. Claude Desktop)"
              maxLength={60}
              aria-label="New token name"
            />
            <Button type="submit" disabled={creating} className="shrink-0">
              {creating ? 'Creating…' : 'Create token'}
            </Button>
          </form>

          {loading ? (
            <div className="h-16 rounded-lg border bg-muted/20 animate-pulse" />
          ) : tokens.length === 0 ? (
            <p className="text-muted-foreground text-xs">
              No tokens yet. Create one to connect Claude.
            </p>
          ) : (
            <ul className="space-y-2">
              {tokens.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">
                      {t.name}
                      {t.revoked && (
                        <span className="ml-2 text-xs text-destructive">revoked</span>
                      )}
                    </p>
                    <p className="font-mono text-xs text-muted-foreground truncate">
                      {t.display} · last used {formatDate(t.lastUsedAt)} · created{' '}
                      {formatDate(t.createdAt)}
                    </p>
                  </div>
                  {!t.revoked && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-destructive hover:text-destructive shrink-0"
                      onClick={() => setRevokeTarget(t)}
                    >
                      <ShieldOff className="w-3.5 h-3.5" />
                      Revoke
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* One-time plaintext token dialog */}
      <Dialog
        open={createdToken !== null}
        onOpenChange={(open) => {
          if (!open) setCreatedToken(null);
        }}
      >
        <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col p-0 gap-0">
          <DialogHeader className="p-6 pb-0 shrink-0">
            <DialogTitle>Token created</DialogTitle>
            <DialogDescription>
              Copy it now, you won&apos;t see this again.
            </DialogDescription>
          </DialogHeader>

          {/* Only this middle section scrolls — header and footer stay put. */}
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-background/60 p-3">
              <code className="flex-1 min-w-0 font-mono text-xs break-all">
                {createdToken?.token}
              </code>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 gap-1.5"
                onClick={() => void handleCopyToken()}
                aria-label={copied ? 'Copied' : 'Copy token'}
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-primary" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>

            {createdToken && (
              <div className="pt-2 border-t border-border/50">
                <p className="text-xs font-medium text-foreground mb-3">
                  Connect Claude with this token
                </p>
                <McpConnectInstructions token={createdToken.token} />
              </div>
            )}
          </div>

          <DialogFooter className="p-6 pt-4 border-t border-border/50 shrink-0">
            <Button onClick={() => setCreatedToken(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke confirmation */}
      <AlertDialog
        open={revokeTarget !== null}
        onOpenChange={(open) => !open && setRevokeTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke this token?</AlertDialogTitle>
            <AlertDialogDescription>
              {revokeTarget && (
                <>
                  Revoke "{revokeTarget.name}" ({revokeTarget.display})? Anything using it
                  will stop working immediately.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revoking}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void handleConfirmRevoke()}
            >
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default ApiTokensCard;
