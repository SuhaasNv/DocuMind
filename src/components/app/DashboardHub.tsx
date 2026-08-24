import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { FileText, Layers, MessageSquare, Pin, ArrowRight, Folder } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { useAppStore } from '@/stores/useAppStore';
import { usePreferencesStore } from '@/stores/usePreferencesStore';
import { getApiBaseUrl } from '@/lib/api';

/** Backend /me/stats shape (MeStatsDto). */
interface MeStats {
  documents: number;
  pagesIndexed: number;
  chatsAsked: number;
  insightsPinned: number;
  cacheHitRate: number | null;
}

/** Backend conversation summary (ConversationSummaryDto). */
interface RecentConversation {
  id: string;
  title: string;
  documentId: string | null;
  collectionId: string | null;
  documentName?: string;
  lastUserMessage?: string;
  updatedAt: string;
}

async function fetchAuthed<T>(path: string, token: string, baseUrl: string): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return (await res.json()) as T;
}

const STAT_CARDS: Array<{
  key: 'documents' | 'pagesIndexed' | 'chatsAsked' | 'insightsPinned';
  label: string;
  icon: typeof FileText;
}> = [
  { key: 'documents', label: 'Documents', icon: FileText },
  { key: 'pagesIndexed', label: 'Pages indexed', icon: Layers },
  { key: 'chatsAsked', label: 'Questions asked', icon: MessageSquare },
  { key: 'insightsPinned', label: 'Insights pinned', icon: Pin },
];

/**
 * Dashboard home hub: stats row + "Continue where you left off" strip of the
 * three most recent server conversations. Clicking one resumes that exact
 * conversation via ChatPage's hydration path (conversationId in router state).
 */
const DashboardHub = () => {
  const navigate = useNavigate();
  const accessToken = useAppStore((s) => s.accessToken);
  const enableAnimations = usePreferencesStore((s) => s.enableAnimations);
  const baseUrl = getApiBaseUrl();
  const enabled = Boolean(accessToken && baseUrl);

  const statsQuery = useQuery({
    queryKey: ['me-stats'],
    queryFn: () => fetchAuthed<MeStats>('/me/stats', accessToken ?? '', baseUrl ?? ''),
    enabled,
  });

  const recentQuery = useQuery({
    queryKey: ['recent-conversations'],
    queryFn: () =>
      fetchAuthed<{ items: RecentConversation[] }>(
        '/conversations?take=3',
        accessToken ?? '',
        baseUrl ?? '',
      ),
    enabled,
  });

  // Only conversations whose chat target still exists can be resumed.
  const recent = (recentQuery.data?.items ?? []).filter(
    (c) => c.documentId || c.collectionId,
  );

  const Wrapper = enableAnimations ? motion.div : 'div';
  const wrapperProps = enableAnimations
    ? {
        initial: { opacity: 0, y: 12 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.3 },
      }
    : {};

  return (
    <Wrapper {...wrapperProps} className="mb-8 space-y-4">
      {/* Stats row — wraps on mobile */}
      <div className="grid grid-cols-2 sm:grid-cols-4 max-[420px]:grid-cols-1 gap-3">
        {STAT_CARDS.map(({ key, label, icon: Icon }) => (
          <div key={key} className="glass-card rounded-xl px-4 py-3 flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Icon className="w-4 h-4 text-primary" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              {statsQuery.isLoading ? (
                <Skeleton className="h-6 w-10 mb-1" />
              ) : (
                <p className="text-xl font-semibold leading-tight">
                  {statsQuery.data?.[key] ?? 0}
                </p>
              )}
              <p className="text-xs text-muted-foreground truncate">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Continue where you left off */}
      {recent.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-muted-foreground mb-2">
            Continue where you left off
          </h2>
          <div className="grid gap-2 sm:grid-cols-3">
            {recent.map((c) => (
              <button
                key={c.id}
                onClick={() =>
                  navigate(
                    c.collectionId
                      ? `/collection/${c.collectionId}/chat`
                      : `/chat/${c.documentId}`,
                    { state: { conversationId: c.id } },
                  )
                }
                className="glass-card rounded-xl p-3 text-left hover:border-primary/30 transition-colors group min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex items-center gap-2 mb-1 min-w-0">
                  {c.collectionId ? (
                    <Folder className="w-3.5 h-3.5 text-primary shrink-0" aria-hidden="true" />
                  ) : (
                    <FileText className="w-3.5 h-3.5 text-primary shrink-0" aria-hidden="true" />
                  )}
                  <span className="text-xs font-medium truncate">
                    {c.documentName ?? (c.collectionId ? 'Collection' : 'Document')}
                  </span>
                  <ArrowRight
                    className="w-3.5 h-3.5 ml-auto shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-hidden="true"
                  />
                </div>
                <p className="text-sm truncate text-foreground/90">
                  {c.lastUserMessage ?? c.title}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {formatDistanceToNow(new Date(c.updatedAt), { addSuffix: true })}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}
    </Wrapper>
  );
};

export default DashboardHub;
