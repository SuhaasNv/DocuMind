import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAppStore } from '@/stores/useAppStore';
import { stopAllChatStreams } from '@/lib/chatStream';
import { usePreferencesStore } from '@/stores/usePreferencesStore';
import { getApiBaseUrl, APP_VERSION, APP_ENV } from '@/lib/api';
import Header from '@/components/app/Header';
import { User, Shield, Key, Settings2, Server, LogOut, Trash2, Link2, Copy, Ban } from 'lucide-react';

interface SharedLink {
  id: string;
  token: string;
  createdAt: string;
  revoked: boolean;
  expiresAt: string | null;
  questionExcerpt: string;
}

const SettingsPage = () => {
  const navigate = useNavigate();
  const [hydrated, setHydrated] = useState(false);
  const persist = useAppStore.persist;
  const prefsPersist = usePreferencesStore.persist;

  const { user, isAuthenticated, setAuthenticated, accessToken } = useAppStore();
  const {
    autoScrollWhileStreaming,
    showSourcesUnderAnswers,
    enableAnimations,
    typewriterEffect,
    showRetrievalDebug,
    setAutoScrollWhileStreaming,
    setShowSourcesUnderAnswers,
    setEnableAnimations,
    setTypewriterEffect,
    setShowRetrievalDebug,
  } = usePreferencesStore();

  // Shared links state
  const [sharedLinks, setSharedLinks] = useState<SharedLink[]>([]);
  const [sharedLoading, setSharedLoading] = useState(true);

  // Change password dialog state
  const [pwOpen, setPwOpen] = useState(false);
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwSubmitting, setPwSubmitting] = useState(false);

  useEffect(() => {
    if (persist.hasHydrated() && prefsPersist.hasHydrated()) {
      setHydrated(true);
      return;
    }
    const unsubAuth = persist.onFinishHydration(() => {
      if (prefsPersist.hasHydrated()) setHydrated(true);
    });
    const unsubPrefs = prefsPersist.onFinishHydration(() => {
      if (persist.hasHydrated()) setHydrated(true);
    });
    return () => {
      unsubAuth();
      unsubPrefs();
    };
  }, [persist, prefsPersist]);

  useEffect(() => {
    if (!hydrated) return;
    if (!isAuthenticated || !user) {
      navigate('/', { replace: true });
    }
  }, [hydrated, isAuthenticated, user, navigate]);

  // Load the user's shared answer links
  useEffect(() => {
    if (!hydrated || !isAuthenticated || !accessToken) return;
    const base = getApiBaseUrl();
    if (!base) {
      setSharedLoading(false);
      return;
    }
    let cancelled = false;
    fetch(`${base}/share/mine`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(async (res) => {
        if (cancelled) return;
        if (res.ok) setSharedLinks((await res.json()) as SharedLink[]);
      })
      .catch(() => {
        // Non-critical card — leave list empty on network failure
      })
      .finally(() => {
        if (!cancelled) setSharedLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [hydrated, isAuthenticated, accessToken]);

  const handleRevokeShare = async (id: string) => {
    const base = getApiBaseUrl();
    if (!base || !accessToken) return;
    try {
      const res = await fetch(`${base}/share/${id}/revoke`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error(`Revoke failed (${res.status})`);
      setSharedLinks((links) =>
        links.map((l) => (l.id === id ? { ...l, revoked: true } : l)),
      );
      toast.success('Share link revoked');
    } catch {
      toast.error('Could not revoke the link');
    }
  };

  const handleCopyShare = async (token: string) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/s/${token}`);
      toast.success('Link copied');
    } catch {
      toast.error('Could not copy the link');
    }
  };

  const handleLogout = () => {
    stopAllChatStreams();
    setAuthenticated(false, null, null);
  };

  const handleClearConversations = () => {
    const { conversations, clearConversation } = useAppStore.getState();
    stopAllChatStreams();
    Object.keys(conversations).forEach((docId) => clearConversation(docId));
    toast.success('Conversation history cleared');
  };

  const handleChangePassword = async () => {
    if (pwNew.length < 8) {
      toast.error('New password must be at least 8 characters');
      return;
    }
    if (pwNew !== pwConfirm) {
      toast.error('New passwords do not match');
      return;
    }
    const base = getApiBaseUrl();
    if (!base) {
      toast.error('Backend URL is not configured');
      return;
    }
    setPwSubmitting(true);
    try {
      const res = await fetch(`${base}/auth/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ currentPassword: pwCurrent, newPassword: pwNew }),
      });
      if (res.ok) {
        toast.success('Password changed successfully');
        setPwOpen(false);
        setPwCurrent('');
        setPwNew('');
        setPwConfirm('');
      } else {
        const body: { message?: string | string[] } = await res.json().catch(() => ({}));
        const msg = Array.isArray(body.message) ? body.message[0] : body.message;
        toast.error(msg || 'Failed to change password');
      }
    } catch {
      toast.error('Network error: could not reach the backend');
    } finally {
      setPwSubmitting(false);
    }
  };

  const backendUrl = getApiBaseUrl() ?? '(not set)';

  if (!hydrated) {
    return (
      <div className="flex h-full flex-col">
        <Header />
        <div className="flex-1 overflow-auto p-6">
          <div className="mx-auto max-w-5xl grid gap-4 lg:grid-cols-2">
            <div className="h-40 rounded-lg border bg-card animate-pulse" />
            <div className="h-40 rounded-lg border bg-card animate-pulse" />
            <div className="h-40 rounded-lg border bg-card animate-pulse" />
            <div className="h-40 rounded-lg border bg-card animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return null;
  }

  return (
    <div className="flex h-full flex-col">
      <Header title="Settings" />
      <main className="flex-1 overflow-auto p-4 sm:p-6">
        <div className="mx-auto max-w-5xl">
          <div className="mb-5">
            <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Manage your account and application preferences.
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-2 items-start">
            {/* Account */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <User className="w-4 h-4 text-primary" />
                  Account
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <Label className="text-muted-foreground text-xs">Full name</Label>
                  <p className="font-medium text-sm truncate">{user.name || '-'}</p>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <Label className="text-muted-foreground text-xs">Email</Label>
                  <p className="font-medium text-sm truncate">{user.email}</p>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <Label className="text-muted-foreground text-xs">Role</Label>
                  <p className="font-medium text-sm capitalize">{(user.role || 'user').toLowerCase()}</p>
                </div>
              </CardContent>
            </Card>

            {/* Security */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Shield className="w-4 h-4 text-primary" />
                  Security
                </CardTitle>
                <CardDescription>Change your password or sign out.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap items-center gap-3">
                  <Button variant="outline" className="gap-2" onClick={() => setPwOpen(true)}>
                    <Key className="w-4 h-4" />
                    Change password
                  </Button>
                  <Button variant="default" onClick={handleLogout} className="gap-2">
                    <LogOut className="w-4 h-4" />
                    Log out
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Preferences */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Settings2 className="w-4 h-4 text-primary" />
                  Preferences
                </CardTitle>
                <CardDescription>Saved in your browser.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <Label htmlFor="auto-scroll" className="font-medium text-sm">
                      Auto-scroll while streaming
                    </Label>
                    <p className="text-muted-foreground text-xs mt-0.5">
                      Follow the latest message as the AI responds.
                    </p>
                  </div>
                  <Switch
                    id="auto-scroll"
                    checked={autoScrollWhileStreaming}
                    onCheckedChange={setAutoScrollWhileStreaming}
                    aria-label="Toggle auto-scroll while streaming"
                  />
                </div>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <Label htmlFor="show-sources" className="font-medium text-sm">
                      Show sources under answers
                    </Label>
                    <p className="text-muted-foreground text-xs mt-0.5">
                      Display the document chunks behind each answer.
                    </p>
                  </div>
                  <Switch
                    id="show-sources"
                    checked={showSourcesUnderAnswers}
                    onCheckedChange={setShowSourcesUnderAnswers}
                    aria-label="Toggle show sources under answers"
                  />
                </div>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <Label htmlFor="typewriter" className="font-medium text-sm">
                      Typewriter effect
                    </Label>
                    <p className="text-muted-foreground text-xs mt-0.5">
                      Reveal answers character by character. Off shows text as fast as it arrives.
                    </p>
                  </div>
                  <Switch
                    id="typewriter"
                    checked={typewriterEffect}
                    onCheckedChange={setTypewriterEffect}
                    aria-label="Toggle typewriter effect"
                  />
                </div>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <Label htmlFor="retrieval-debug" className="font-medium text-sm">
                      Show retrieval details
                    </Label>
                    <p className="text-muted-foreground text-xs mt-0.5">
                      Expose scores, timings, and cache status behind each answer.
                    </p>
                  </div>
                  <Switch
                    id="retrieval-debug"
                    checked={showRetrievalDebug}
                    onCheckedChange={setShowRetrievalDebug}
                    aria-label="Toggle show retrieval details"
                  />
                </div>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <Label htmlFor="enable-animations" className="font-medium text-sm">
                      Enable animations
                    </Label>
                    <p className="text-muted-foreground text-xs mt-0.5">
                      Transitions and micro-interactions across the app.
                    </p>
                  </div>
                  <Switch
                    id="enable-animations"
                    checked={enableAnimations}
                    onCheckedChange={setEnableAnimations}
                    aria-label="Toggle animations"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Shared links */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Link2 className="w-4 h-4 text-primary" />
                  Shared links
                </CardTitle>
                <CardDescription>
                  Public links to answers you shared. Revoking makes a link stop working immediately.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {sharedLoading ? (
                  <div className="h-10 rounded-md bg-muted/40 animate-pulse" />
                ) : sharedLinks.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No shared links yet. Use the share button under an answer in chat.
                  </p>
                ) : (
                  <ul className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {sharedLinks.map((link) => (
                      <li
                        key={link.id}
                        className="flex items-center gap-2 rounded-lg border border-border/50 px-2.5 py-2"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate">
                            {link.questionExcerpt || 'Shared answer'}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {new Date(link.createdAt).toLocaleDateString()}
                            {link.revoked && ' · revoked'}
                            {!link.revoked &&
                              link.expiresAt &&
                              new Date(link.expiresAt).getTime() <= Date.now() &&
                              ' · expired'}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground shrink-0"
                          onClick={() => void handleCopyShare(link.token)}
                          disabled={link.revoked}
                          aria-label="Copy public link"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive/70 hover:text-destructive shrink-0"
                          onClick={() => void handleRevokeShare(link.id)}
                          disabled={link.revoked}
                          aria-label="Revoke link"
                        >
                          <Ban className="w-3.5 h-3.5" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            {/* Data & system */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Server className="w-4 h-4 text-primary" />
                  Data &amp; System
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium text-sm">Clear conversation history</p>
                    <p className="text-muted-foreground text-xs mt-0.5">
                      Removes all chat messages on this device. Documents are kept.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 text-destructive hover:text-destructive shrink-0"
                    onClick={handleClearConversations}
                  >
                    <Trash2 className="w-4 h-4" />
                    Clear
                  </Button>
                </div>
                <div className="space-y-2 pt-1 border-t border-border/50">
                  <div className="flex items-center justify-between gap-4 pt-2">
                    <Label className="text-muted-foreground text-xs">Backend URL</Label>
                    <p className="font-mono text-xs truncate">{backendUrl}</p>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <Label className="text-muted-foreground text-xs">App version</Label>
                    <p className="font-mono text-xs">{APP_VERSION}</p>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <Label className="text-muted-foreground text-xs">Environment</Label>
                    <p className="font-mono text-xs capitalize">{APP_ENV}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      {/* Change password dialog */}
      <Dialog open={pwOpen} onOpenChange={setPwOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Change password</DialogTitle>
            <DialogDescription>
              Enter your current password and choose a new one (min 8 characters).
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void handleChangePassword();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="pw-current">Current password</Label>
              <Input
                id="pw-current"
                type="password"
                autoComplete="current-password"
                value={pwCurrent}
                onChange={(e) => setPwCurrent(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pw-new">New password</Label>
              <Input
                id="pw-new"
                type="password"
                autoComplete="new-password"
                value={pwNew}
                onChange={(e) => setPwNew(e.target.value)}
                required
                minLength={8}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pw-confirm">Confirm new password</Label>
              <Input
                id="pw-confirm"
                type="password"
                autoComplete="new-password"
                value={pwConfirm}
                onChange={(e) => setPwConfirm(e.target.value)}
                required
                minLength={8}
              />
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="ghost" onClick={() => setPwOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pwSubmitting}>
                {pwSubmitting ? 'Changing…' : 'Change password'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SettingsPage;
