import { useEffect } from 'react';
import { useAppStore, type ChatSource, type Message } from '@/stores/useAppStore';
import { getApiBaseUrl } from '@/lib/api';

/** Server conversation shapes (match backend conversation DTOs). */
interface ApiConversationSummary {
  id: string;
  title: string;
  documentId: string | null;
  collectionId: string | null;
}

interface ApiConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: ChatSource[];
  truncated: boolean;
  createdAt: string;
}

interface ApiConversationDetail extends ApiConversationSummary {
  messages: ApiConversationMessage[];
}

function toStoreMessage(m: ApiConversationMessage): Message {
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    timestamp: new Date(m.createdAt),
    sources: m.sources,
  };
}

/**
 * Hydrate a chat from the server when the store has no messages for the
 * chat key but the server has a conversation for it. The key is a document
 * id or `col:<collectionId>` for collection chats. Runs once per chat key
 * (tracked in the store) so "New chat" and sent messages are never
 * overwritten. Zustand stays a cache; the server is the source of truth.
 *
 * `preferredConversationId` (e.g. from router state when resuming a specific
 * conversation) skips the "most recent" lookup.
 */
export function useConversationHydration(
  chatKey: string | undefined,
  preferredConversationId?: string,
): void {
  const hydrated = useAppStore((s) =>
    chatKey ? Boolean(s.hydratedChatKeys[chatKey]) : true,
  );

  useEffect(() => {
    if (!chatKey || hydrated) return;
    const store = useAppStore.getState();
    if ((store.conversations[chatKey]?.messages.length ?? 0) > 0) {
      store.markChatHydrated(chatKey);
      return;
    }
    const baseUrl = getApiBaseUrl();
    const token = store.accessToken;
    if (!baseUrl || !token) return;
    const headers = { Authorization: `Bearer ${token}` };

    // Chat targets: `col:<id>` keys are collection chats, others documents.
    const targetFilter = chatKey.startsWith('col:')
      ? `collectionId=${encodeURIComponent(chatKey.slice(4))}`
      : `documentId=${encodeURIComponent(chatKey)}`;

    let cancelled = false;
    void (async () => {
      try {
        let conversationId = preferredConversationId;
        if (!conversationId) {
          const listRes = await fetch(
            `${baseUrl}/conversations?${targetFilter}&take=1`,
            { headers },
          );
          if (!listRes.ok) return;
          const list = (await listRes.json()) as {
            items: ApiConversationSummary[];
          };
          conversationId = list.items[0]?.id;
        }
        if (!conversationId || cancelled) return;

        const detailRes = await fetch(
          `${baseUrl}/conversations/${encodeURIComponent(conversationId)}`,
          { headers },
        );
        if (!detailRes.ok) return;
        const detail = (await detailRes.json()) as ApiConversationDetail;
        if (cancelled || detail.messages.length === 0) return;

        const latest = useAppStore.getState();
        // The user may have started typing while we fetched — never clobber.
        if ((latest.conversations[chatKey]?.messages.length ?? 0) > 0) return;
        latest.setConversationMessages(
          chatKey,
          detail.messages.map(toStoreMessage),
        );
        latest.setServerConversationId(chatKey, detail.id);
      } catch {
        // Offline/unreachable: chat simply starts empty.
      } finally {
        if (!cancelled) useAppStore.getState().markChatHydrated(chatKey);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [chatKey, hydrated, preferredConversationId]);
}
