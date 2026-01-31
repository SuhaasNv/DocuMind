import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Header from '@/components/app/Header';
import MessageBubble from '@/components/chat/MessageBubble';
import ChatInput from '@/components/chat/ChatInput';
import EmptyChat from '@/components/chat/EmptyChat';
import TypingIndicator from '@/components/chat/TypingIndicator';
import { useAppStore, Message } from '@/stores/useAppStore';
import { usePreferencesStore } from '@/stores/usePreferencesStore';
import { streamChat } from '@/lib/sseChat';
import { getApiBaseUrl } from '@/lib/api';

const SCROLL_THRESHOLD_PX = 120;
const SSE_TIMEOUT_MS = 90000;

const ChatPage = () => {
  const { documentId } = useParams<{ documentId: string }>();
  const navigate = useNavigate();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const streamAbortRef = useRef<AbortController | null>(null);
  const streamTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  const {
    documents,
    conversations,
    addMessage,
    updateMessage,
    setStreaming,
    setMessageSources,
    accessToken,
    setAbortActiveSSE,
  } = useAppStore();
  const autoScrollWhileStreaming = usePreferencesStore((s) => s.autoScrollWhileStreaming);

  const document = documents.find((doc) => doc.id === documentId);
  const conversation = documentId ? conversations[documentId] : null;
  const messages = conversation?.messages || [];
  const isStreaming = messages.some((m) => m.isStreaming);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const container = scrollContainerRef.current;
    if (container) {
      if (behavior === 'instant') {
        container.scrollTop = container.scrollHeight;
      } else {
        messagesEndRef.current?.scrollIntoView({ behavior });
      }
    }
  }, []);

  const isNearBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return true;
    const { scrollTop, scrollHeight, clientHeight } = el;
    return scrollHeight - scrollTop - clientHeight < SCROLL_THRESHOLD_PX;
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    setAbortActiveSSE(() => () => {
      if (streamTimeoutRef.current) {
        clearTimeout(streamTimeoutRef.current);
        streamTimeoutRef.current = null;
      }
      streamAbortRef.current?.abort();
    });
    return () => {
      isMountedRef.current = false;
      setAbortActiveSSE(null);
      if (streamTimeoutRef.current) {
        clearTimeout(streamTimeoutRef.current);
        streamTimeoutRef.current = null;
      }
      streamAbortRef.current?.abort();
      const docId = documentId ?? null;
      const conv = docId ? useAppStore.getState().conversations[docId] : null;
      const streamingMsg = conv?.messages.find((m) => m.isStreaming);
      if (docId && streamingMsg) {
        useAppStore.getState().setStreaming(docId, streamingMsg.id, false);
      }
    };
  }, [documentId, setAbortActiveSSE]);

  // Auto-scroll to bottom while streaming when preference is on (always follow new content).
  useEffect(() => {
    if (!isStreaming || !autoScrollWhileStreaming) return;
    scrollToBottom('instant');
  }, [messages, isStreaming, autoScrollWhileStreaming, scrollToBottom]);

  const handleSendMessage = useCallback(
    async (content: string) => {
      if (!documentId) return;

      const baseUrl = getApiBaseUrl();
      if (!baseUrl) {
        addMessage(documentId, {
          id: `msg-${Date.now()}`,
          role: 'user',
          content,
          timestamp: new Date(),
        });
        addMessage(documentId, {
          id: `msg-${Date.now() + 1}`,
          role: 'assistant',
          content: 'Backend URL is not configured. Add VITE_API_URL to .env at the project root and restart the dev server.',
          timestamp: new Date(),
        });
        return;
      }

      streamAbortRef.current?.abort();
      streamAbortRef.current = new AbortController();
      const signal = streamAbortRef.current.signal;
      const currentDocumentId = documentId;

      const userMessage: Message = {
        id: `msg-${Date.now()}`,
        role: 'user',
        content,
        timestamp: new Date(),
      };
      addMessage(documentId, userMessage);

      const assistantId = `msg-${Date.now() + 1}`;
      const assistantMessage: Message = {
        id: assistantId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        isStreaming: true,
      };
      addMessage(documentId, assistantMessage);

      let fullContent = '';

      const appendContent = (chunk: string) => {
        if (!isMountedRef.current || signal.aborted || currentDocumentId !== documentId) return;
        fullContent += chunk;
        updateMessage(currentDocumentId, assistantId, fullContent);
      };

      const clearStreamTimeout = () => {
        if (streamTimeoutRef.current) {
          clearTimeout(streamTimeoutRef.current);
          streamTimeoutRef.current = null;
        }
      };

      streamTimeoutRef.current = setTimeout(() => {
        streamTimeoutRef.current = null;
        streamAbortRef.current?.abort();
        if (!isMountedRef.current || currentDocumentId !== documentId) return;
        updateMessage(documentId, assistantId, 'Request timed out. Please try again.');
        setStreaming(documentId, assistantId, false);
      }, SSE_TIMEOUT_MS);

      await streamChat(
        documentId,
        content,
        {
          onDelta: (chunk) => {
            if (signal.aborted || !isMountedRef.current) return;
            appendContent(chunk);
          },
          onDone: (sources) => {
            clearStreamTimeout();
            if (!isMountedRef.current || signal.aborted) return;
            if (currentDocumentId !== documentId) return;
            setStreaming(documentId, assistantId, false);
            if (sources.length > 0) setMessageSources(documentId, assistantId, sources);
          },
          onError: (message) => {
            clearStreamTimeout();
            if (!isMountedRef.current || signal.aborted) return;
            if (currentDocumentId !== documentId) return;
            updateMessage(documentId, assistantId, `Sorry, something went wrong: ${message}`);
            setStreaming(documentId, assistantId, false);
          },
        },
        {
          signal,
          getToken: () => accessToken,
          baseUrl,
        }
      );

    },
    [
      documentId,
      addMessage,
      updateMessage,
      setStreaming,
      setMessageSources,
      accessToken,
    ]
  );

  if (!document) {
    return (
      <>
        <Header title="Chat" />
        <div className="flex-1 flex items-center justify-center px-4 py-safe">
          <div className="text-center max-w-md">
            <FileText className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-lg sm:text-xl font-semibold mb-2">Document not found</h2>
            <p className="text-muted-foreground text-mobile-safe mb-4">This document isn't in your library. It may have been deleted or the link is outdated.</p>
            <Button onClick={() => navigate('/app')} className="min-h-touch">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Documents
            </Button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <header className="h-16 min-h-touch border-b border-border bg-background/80 backdrop-blur-lg flex items-center px-4 sm:px-6 pl-safe pr-safe sticky top-0 z-40 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/app')}
          className="mr-2 sm:mr-4 min-h-touch min-w-touch md:min-h-0 md:min-w-0 shrink-0"
          aria-label="Back to documents"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
            <FileText className="w-4 h-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="font-medium truncate text-sm sm:text-base max-w-[200px] xs:max-w-[260px] phone:max-w-[300px] sm:max-w-none">{document.name}</h1>
            <p className="text-xs text-muted-foreground text-mobile-safe">Chat with your document</p>
          </div>
        </div>
      </header>

      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto min-h-0 overflow-x-hidden"
        >
          {messages.length === 0 ? (
            <EmptyChat onPromptClick={handleSendMessage} />
          ) : (
            <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 sm:py-6 space-y-6">
              <AnimatePresence mode="popLayout">
                {messages.map((message) => (
                  <MessageBubble key={message.id} message={message} />
                ))}
              </AnimatePresence>

              <AnimatePresence>
                {isStreaming && <TypingIndicator />}
              </AnimatePresence>

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        <ChatInput
          onSend={handleSendMessage}
          isLoading={isStreaming}
          disabled={document.status !== 'DONE'}
        />
      </div>
    </>
  );
};

export default ChatPage;
