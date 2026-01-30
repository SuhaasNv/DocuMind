import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useAppStore } from '@/stores/useAppStore';
import { usePreferencesStore } from '@/stores/usePreferencesStore';
import { getApiBaseUrl, APP_VERSION, APP_ENV } from '@/lib/api';
import Header from '@/components/app/Header';
import { User, Shield, Key, Settings2, Server, LogOut } from 'lucide-react';

const SettingsPage = () => {
  const navigate = useNavigate();
  const [hydrated, setHydrated] = useState(false);
  const persist = useAppStore.persist;
  const prefsPersist = usePreferencesStore.persist;

  const { user, isAuthenticated, setAuthenticated, abortActiveSSE } = useAppStore();
  const {
    autoScrollWhileStreaming,
    showSourcesUnderAnswers,
    enableAnimations,
    setAutoScrollWhileStreaming,
    setShowSourcesUnderAnswers,
    setEnableAnimations,
  } = usePreferencesStore();

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

  const handleLogout = () => {
    abortActiveSSE?.();
    setAuthenticated(false, null, null);
  };

  const backendUrl = getApiBaseUrl() ?? '(not set)';

  if (!hydrated) {
    return (
      <div className="flex h-full flex-col">
        <Header />
        <div className="flex-1 overflow-auto p-6">
          <div className="mx-auto max-w-2xl space-y-6">
            <div className="h-8 w-48 rounded bg-muted animate-pulse" />
            <div className="h-32 rounded-lg border bg-card animate-pulse" />
            <div className="h-32 rounded-lg border bg-card animate-pulse" />
            <div className="h-32 rounded-lg border bg-card animate-pulse" />
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
      <Header />
      <main className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-2xl space-y-8">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
              <p className="text-muted-foreground text-sm mt-1">
                Manage your account and application preferences.
              </p>
            </div>

            {/* A. Account Settings */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="w-5 h-5 text-primary" />
                  Account Settings
                </CardTitle>
                <CardDescription>Your account information (read-only).</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-muted-foreground text-xs">Full name</Label>
                  <p className="mt-1 font-medium" aria-readonly>
                    {user.name || '—'}
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">Email</Label>
                  <p className="mt-1 font-medium" aria-readonly>
                    {user.email}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* B. Security */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-primary" />
                  Security
                </CardTitle>
                <CardDescription>Log out or change password.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <Button variant="default" onClick={handleLogout} className="gap-2">
                    <LogOut className="w-4 h-4" />
                    Log out
                  </Button>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-block">
                        <Button variant="outline" className="gap-2" disabled>
                          <Key className="w-4 h-4" />
                          Change password
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Change password is not implemented yet.</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </CardContent>
            </Card>

            {/* C. Application Preferences */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings2 className="w-5 h-5 text-primary" />
                  Application Preferences
                </CardTitle>
                <CardDescription>
                  These settings are saved in your browser.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <Label htmlFor="auto-scroll" className="font-medium">
                      Auto-scroll while streaming
                    </Label>
                    <p className="text-muted-foreground text-sm mt-0.5">
                      Scroll chat to the latest message as the AI responds.
                    </p>
                  </div>
                  <Switch
                    id="auto-scroll"
                    checked={autoScrollWhileStreaming}
                    onCheckedChange={setAutoScrollWhileStreaming}
                    aria-label="Toggle auto-scroll while streaming"
                  />
                </div>
                <Separator />
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <Label htmlFor="show-sources" className="font-medium">
                      Show sources under answers
                    </Label>
                    <p className="text-muted-foreground text-sm mt-0.5">
                      Display document chunks used to generate each answer.
                    </p>
                  </div>
                  <Switch
                    id="show-sources"
                    checked={showSourcesUnderAnswers}
                    onCheckedChange={setShowSourcesUnderAnswers}
                    aria-label="Toggle show sources under answers"
                  />
                </div>
                <Separator />
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <Label htmlFor="enable-animations" className="font-medium">
                      Enable animations
                    </Label>
                    <p className="text-muted-foreground text-sm mt-0.5">
                      Use Framer Motion for transitions and micro-interactions.
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

            {/* D. System Info */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Server className="w-5 h-5 text-primary" />
                  System Info
                </CardTitle>
                <CardDescription>Read-only environment and version.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-muted-foreground text-xs">Backend URL</Label>
                  <p className="mt-1 font-mono text-sm break-all" aria-readonly>
                    {backendUrl}
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">App version</Label>
                  <p className="mt-1 font-mono text-sm" aria-readonly>
                    {APP_VERSION}
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">Environment</Label>
                  <p className="mt-1 font-mono text-sm capitalize" aria-readonly>
                    {APP_ENV}
                  </p>
                </div>
              </CardContent>
            </Card>
        </div>
      </main>
    </div>
  );
};

export default SettingsPage;
