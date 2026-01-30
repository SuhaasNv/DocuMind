/**
 * SSE chat client for POST /documents/:id/chat/stream.
 * Uses fetch() + ReadableStream (not EventSource) to support POST + Authorization.
 * Auth: prefer Authorization: Bearer <token> (header). Backend also accepts ?token= for proxies that strip headers.
 * Parses event: delta and event: done; ignores keepalive/empty.
 * Does not throw on abort.
 */

export interface ChatSource {
  chunkIndex: number;
  score: number;
}

export interface StreamChatCallbacks {
  onDelta: (chunk: string) => void;
  onDone: (sources: ChatSource[]) => void;
  onError: (message: string) => void;
}

export interface StreamChatOptions {
  signal?: AbortSignal;
  getToken: () => string | null;
  baseUrl: string;
}

/**
 * Stream chat: POST with { question }, parse SSE, invoke callbacks.
 * On abort: stops reading and returns without calling onError or throwing.
 */
export async function streamChat(
  documentId: string,
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

  const url = `${baseUrl.replace(/\/$/, '')}/documents/${encodeURIComponent(documentId)}/chat/stream`;
  let res: Response;

  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ question }),
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
      callbacks.onError('Session expired, please log in again');
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
            const payload = JSON.parse(dataLine) as { sources?: ChatSource[] };
            callbacks.onDone(Array.isArray(payload.sources) ? payload.sources : []);
          } catch {
            callbacks.onDone([]);
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
          const payload = JSON.parse(dataLine) as { sources?: ChatSource[] };
          callbacks.onDone(Array.isArray(payload.sources) ? payload.sources : []);
        } catch {
          callbacks.onDone([]);
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
