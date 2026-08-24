/**
 * SSE chat client for the chat stream endpoints.
 * Uses fetch() + ReadableStream (not EventSource) to support POST + Authorization.
 * Auth: prefer Authorization: Bearer <token> (header). Backend also accepts ?token= for proxies that strip headers.
 * Parses event: delta and event: done; ignores keepalive/empty.
 * Does not throw on abort.
 */

import { checkSessionExpired, ERROR_MESSAGES } from './errorMessages';

export interface ChatSource {
  /** 1-based citation number matching [n] markers in the answer. */
  marker?: number;
  chunkIndex: number;
  score: number;
  snippet?: string;
  /** Source-PDF page range; null for docs ingested before page-aware chunking. */
  pageStart?: number | null;
  pageEnd?: number | null;
  /** ~150-char excerpt for highlight-matching in the PDF viewer. */
  quote?: string;
  /** Collection chat: which document this source came from. */
  documentId?: string;
  documentName?: string;
}

export interface RetrievalDebugCandidate {
  chunkIndex: number;
  documentId?: string;
  denseScore?: number;
  lexicalScore?: number;
  rrfScore: number;
  /** Survived RRF top-K selection. */
  retained: boolean;
  /** Survived prompt context trimming (sent to the LLM). */
  included: boolean;
  /** 1-based citation number matching [n] in the answer; set only when included. */
  marker?: number;
}

export interface RetrievalDebugTimings {
  embedMs: number;
  retrievalMs: number;
  promptBuildMs: number;
  llmFirstTokenMs?: number;
  totalMs: number;
}

/** Backend RagDebugDto: retrieval transparency payload on the done event. */
export interface RetrievalDebug {
  cacheStatus: 'miss' | 'exact' | 'semantic';
  semanticSimilarity?: number;
  timings: RetrievalDebugTimings;
  candidates: RetrievalDebugCandidate[];
  topK: number;
  historyTurns: number;
}

/** Keep only a plausible debug object from an untrusted done-event payload. */
function parseDebugPayload(value: unknown): RetrievalDebug | undefined {
  return typeof value === 'object' && value !== null
    ? (value as RetrievalDebug)
    : undefined;
}

export interface StreamChatCallbacks {
  onDelta: (chunk: string) => void;
  onDone: (
    sources: ChatSource[],
    followUps: string[],
    debug?: RetrievalDebug,
    conversationId?: string,
  ) => void;
  onError: (message: string) => void;
}

export interface ChatHistoryTurn {
  role: 'user' | 'assistant';
  content: string;
}

/** Keep only an array of strings from an untrusted done-event payload. */
function parseFollowUpsPayload(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((q): q is string => typeof q === 'string')
    : [];
}

export interface StreamChatOptions {
  /** Recent conversation turns, oldest first (server token-caps them). */
  history?: ChatHistoryTurn[];
  /** When true, ask the backend for retrieval debug info on the done event. */
  debug?: boolean;
  /** Server conversation to append this turn to (absent → server creates one). */
  conversationId?: string;
  signal?: AbortSignal;
  getToken: () => string | null;
  baseUrl: string;
}

/**
 * Stream chat: POST with { question }, parse SSE, invoke callbacks.
 * On abort: stops reading and returns without calling onError or throwing.
 * `streamPath` is the endpoint path (e.g. `/documents/:id/chat/stream` or
 * `/collections/:id/chat/stream`) — both speak the same SSE protocol.
 */
export async function streamChat(
  streamPath: string,
  question: string,
  callbacks: StreamChatCallbacks,
  options: StreamChatOptions
): Promise<void> {
  const { signal, getToken, baseUrl } = options;
  const token = getToken();
  if (!token) {
    callbacks.onError('Not authenticated');
    return;
  }

  const url = `${baseUrl.replace(/\/$/, '')}${streamPath}`;
  let res: Response;

  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        question,
        history: options.history,
        // Undefined when off, so the key is omitted from the payload entirely.
        debug: options.debug ? true : undefined,
        conversationId: options.conversationId,
      }),
      signal,
    });
  } catch (err) {
    if (signal?.aborted) return;
    callbacks.onError(err instanceof Error ? err.message : 'Request failed');
    return;
  }

  if (!res.ok) {
    if (signal?.aborted) return;
    if (res.status === 401) {
      // Route through the shared guard (clears auth + toasts once).
      try {
        checkSessionExpired(res);
      } catch (err) {
        callbacks.onError(
          err instanceof Error ? err.message : ERROR_MESSAGES.sessionExpired,
        );
      }
      return;
    }
    const text = await res.text();
    try {
      const body = JSON.parse(text) as { message?: string };
      callbacks.onError(body.message ?? `Request failed (${res.status})`);
    } catch {
      callbacks.onError(text || `Request failed (${res.status})`);
    }
    return;
  }

  const body = res.body;
  if (!body) {
    if (!signal?.aborted) callbacks.onError('No response body');
    return;
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      if (signal?.aborted) return;
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split(/\n\n/);
      buffer = events.pop() ?? '';

      for (const raw of events) {
        if (signal?.aborted) return;
        const lines = raw.split('\n');
        let eventType = '';
        let dataLine = '';

        for (const line of lines) {
          if (line.startsWith('event:')) eventType = line.slice(6).trim();
          else if (line.startsWith('data:')) dataLine = line.slice(5).trim();
        }

        if (!eventType || !dataLine) continue;

        if (eventType === 'delta') {
          try {
            const chunk = JSON.parse(dataLine) as string;
            if (typeof chunk === 'string') callbacks.onDelta(chunk);
          } catch {
            callbacks.onDelta(dataLine);
          }
          continue;
        }

        if (eventType === 'done') {
          try {
            const payload = JSON.parse(dataLine) as {
              sources?: ChatSource[];
              followUps?: unknown;
              debug?: unknown;
              conversationId?: string;
            };
            callbacks.onDone(
              Array.isArray(payload.sources) ? payload.sources : [],
              parseFollowUpsPayload(payload.followUps),
              parseDebugPayload(payload.debug),
              payload.conversationId,
            );
          } catch {
            callbacks.onDone([], []);
          }
          return;
        }

        if (eventType === 'error') {
          try {
            const payload = JSON.parse(dataLine) as { message?: string };
            callbacks.onError(payload.message ?? 'Stream error');
          } catch {
            callbacks.onError('Stream error');
          }
          return;
        }
      }
    }

    if (buffer.trim()) {
      const lines = buffer.split('\n');
      let eventType = '';
      let dataLine = '';
      for (const line of lines) {
        if (line.startsWith('event:')) eventType = line.slice(6).trim();
        else if (line.startsWith('data:')) dataLine = line.slice(5).trim();
      }
      if (eventType === 'done' && dataLine) {
        try {
          const payload = JSON.parse(dataLine) as {
            sources?: ChatSource[];
            followUps?: unknown;
            debug?: unknown;
            conversationId?: string;
          };
          callbacks.onDone(
            Array.isArray(payload.sources) ? payload.sources : [],
            parseFollowUpsPayload(payload.followUps),
            parseDebugPayload(payload.debug),
            payload.conversationId,
          );
        } catch {
          callbacks.onDone([], []);
        }
      }
    }
  } catch (err) {
    if (signal?.aborted) return;
    callbacks.onError(err instanceof Error ? err.message : 'Stream failed');
  } finally {
    reader.releaseLock();
  }
}
