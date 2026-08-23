import { streamChat, type ChatHistoryTurn } from './sseChat';
import { getApiBaseUrl } from './api';
import { useAppStore, type Message } from '@/stores/useAppStore';
import { usePreferencesStore } from '@/stores/usePreferencesStore';

/**
 * Module-level chat stream controller.
 * Streams live outside React components and write into the Zustand store,
 * so an in-flight answer keeps generating when the user navigates away
 * from the chat page and is complete when they return.
 */

const controllers = new Map<string, AbortController>();

/** Abort the active stream for one document (Stop button, New chat, regenerate). */
export function stopChatStream(documentId: string): void {
  controllers.get(documentId)?.abort();
  controllers.delete(documentId);
}

/** Abort every active stream (logout). */
export function stopAllChatStreams(): void {
  for (const controller of controllers.values()) controller.abort();
  controllers.clear();
}

/** Idle timeout: aborts only if no delta arrives for this long (resets on each chunk). */
const SSE_IDLE_TIMEOUT_MS = 90000;

export async function sendChatMessage(documentId: string, content: string): Promise<void> {
  const store = useAppStore.getState();

  // Snapshot recent turns BEFORE appending the new question, so the backend
  // can resolve references like "elaborate on that". Server token-caps them.
  const history: ChatHistoryTurn[] = (
    store.conversations[documentId]?.messages ?? []
  )
    .filter((m) => !m.isError && !m.isStreaming && m.content.trim().length > 0)
    .slice(-10)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 8000) }));

  const userMessage: Message = {
    id: `msg-${Date.now()}`,
    role: 'user',
    content,
    timestamp: new Date(),
  };
  store.addMessage(documentId, userMessage);

  const assistantId = `msg-${Date.now() + 1}`;
  const assistantMessage: Message = {
    id: assistantId,
    role: 'assistant',
    content: '',
    timestamp: new Date(),
    isStreaming: true,
  };
  store.addMessage(documentId, assistantMessage);

  const baseUrl = getApiBaseUrl();
  if (!baseUrl) {
    store.updateMessage(
      documentId,
      assistantId,
      'Backend URL is not configured. Add VITE_API_URL to .env at the project root and restart the dev server.',
    );
    store.setStreaming(documentId, assistantId, false);
    store.setMessageError(documentId, assistantId);
    return;
  }

  stopChatStream(documentId);
  const controller = new AbortController();
  controllers.set(documentId, controller);
  const { signal } = controller;

  let fullContent = '';
  let idleTimer: ReturnType<typeof setTimeout> | null = null;

  // Batch delta -> store updates into a ~50ms flush instead of one state
  // update (and one re-render) per token.
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  const flushContent = () => {
    flushTimer = null;
    useAppStore.getState().updateMessage(documentId, assistantId, fullContent);
  };
  const scheduleFlush = () => {
    if (flushTimer === null) flushTimer = setTimeout(flushContent, 50);
  };
  const cancelAndFlush = () => {
    if (flushTimer !== null) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    useAppStore.getState().updateMessage(documentId, assistantId, fullContent);
  };

  const clearIdleTimer = () => {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
  };
  const resetIdleTimer = () => {
    clearIdleTimer();
    idleTimer = setTimeout(() => {
      idleTimer = null;
      controller.abort();
      const s = useAppStore.getState();
      fullContent = fullContent || 'Request timed out. Please try again.';
      cancelAndFlush();
      s.setStreaming(documentId, assistantId, false);
      if (!fullContent) s.setMessageError(documentId, assistantId);
    }, SSE_IDLE_TIMEOUT_MS);
  };
  resetIdleTimer();

  try {
    await streamChat(
      documentId,
      content,
      {
        onDelta: (chunk) => {
          if (signal.aborted) return;
          resetIdleTimer();
          fullContent += chunk;
          scheduleFlush();
        },
        onDone: (sources, debug) => {
          clearIdleTimer();
          if (signal.aborted) return;
          cancelAndFlush();
          const s = useAppStore.getState();
          s.setStreaming(documentId, assistantId, false);
          if (sources.length > 0) s.setMessageSources(documentId, assistantId, sources);
          if (debug) s.setMessageDebug(documentId, assistantId, debug);
        },
        onError: (message) => {
          clearIdleTimer();
          if (signal.aborted) return;
          // Mid-stream error: keep the partial answer, append the error note.
          fullContent = fullContent.length > 0
            ? `${fullContent}\n\n_${message}_`
            : `Sorry, something went wrong: ${message}`;
          cancelAndFlush();
          const s = useAppStore.getState();
          s.setStreaming(documentId, assistantId, false);
          s.setMessageError(documentId, assistantId);
        },
      },
      {
        signal,
        getToken: () => useAppStore.getState().accessToken,
        baseUrl,
        history,
        debug: usePreferencesStore.getState().showRetrievalDebug,
      },
    );
  } finally {
    clearIdleTimer();
    if (flushTimer !== null) cancelAndFlush();
    if (controllers.get(documentId) === controller) controllers.delete(documentId);
    // If aborted mid-stream (Stop button / logout), leave the partial text but end the streaming state.
    const s = useAppStore.getState();
    const msg = s.conversations[documentId]?.messages.find((m) => m.id === assistantId);
    if (msg?.isStreaming) s.setStreaming(documentId, assistantId, false);
  }
}
