import { useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, FileText, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import Header from '@/components/app/Header';
import MessageBubble from '@/components/chat/MessageBubble';
import ChatInput from '@/components/chat/ChatInput';
import { EmptyChatState } from '@/components/app/EmptyStates';
import TypingIndicator from '@/components/chat/TypingIndicator';
import { useAppStore, Message } from '@/stores/useAppStore';
import { usePreferencesStore } from '@/stores/usePreferencesStore';
import { streamChat } from '@/lib/sseChat';
import { getApiBaseUrl } from '@/lib/api';

const FOLLOW_UP_SUGGESTIONS = [
  'Can you elaborate?',
  'Give me an example',
  'Summarize in one sentence',
  'What are the key takeaways?',
  'Any counterarguments?',
] as const;

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
    setMessageError,
    clearConversation,
    removeLastMessages,
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
            setMessageError(documentId, assistantId);
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
      setMessageError,
      accessToken,
    ]
  );

  const handleNewChat = useCallback(() => {
    if (documentId) {
      streamAbortRef.current?.abort();
      clearConversation(documentId);
    }
  }, [documentId, clearConversation]);

  /**
   * Finds the last user message, removes everything from the last assistant
   * message onwards, then re-sends the user query — works for both
   * Regenerate (successful response) and Retry (error response).
   */
  const handleRegenerate = useCallback(() => {
    if (!documentId) return;
    const currentMessages = useAppStore.getState().conversations[documentId]?.messages ?? [];
    const lastUserMsg = [...currentMessages].reverse().find((m) => m.role === 'user');
    if (!lastUserMsg) return;
    const lastAssistantIdx = currentMessages.map((m) => m.role).lastIndexOf('assistant');
    if (lastAssistantIdx === -1) return;
    streamAbortRef.current?.abort();
    removeLastMessages(documentId, currentMessages.length - lastAssistantIdx);
    // Defer until the store update has been applied
    setTimeout(() => handleSendMessage(lastUserMsg.content), 0);
  }, [documentId, removeLastMessages, handleSendMessage]);

  if (!document) {
    return (
      <>
        <Header title="Chat" />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <FileText className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Document not found</h2>
            <p className="text-muted-foreground mb-4">This document isn't in your library. It may have been deleted or the link is outdated.</p>
            <Button onClick={() => navigate('/app')}>
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
      <header className="h-16 border-b border-border bg-background/80 backdrop-blur-lg flex items-center px-6 sticky top-0 z-40 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/app')}
          className="mr-4"
          aria-label="Back to documents"
        >
          <ArrowLeft className="w-5 h-5" aria-hidden="true" />
        </Button>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center shrink-0" aria-hidden="true">
            <FileText className="w-4 h-4 text-primary" />
          </div>
          <div className="min-w-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <h1 className="font-medium truncate max-w-[300px] cursor-default">{document.name}</h1>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs break-words">
                {document.name}
              </TooltipContent>
            </Tooltip>
            <p className="text-xs text-muted-foreground">Chat with your document</p>
          </div>
        </div>

        {/* New Chat */}
        {messages.length > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleNewChat}
                className="ml-auto shrink-0 gap-1.5 text-muted-foreground hover:text-foreground"
                aria-label="Start a new chat"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                <span className="hidden sm:inline text-sm">New chat</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Start a new conversation</TooltipContent>
          </Tooltip>
        )}
      </header>

      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto min-h-0"
          role="log"
          aria-label="Chat messages"
          aria-live="polite"
          aria-atomic="false"
        >
          {messages.length === 0 ? (
            <EmptyChatState onPromptClick={handleSendMessage} isLoading={isStreaming} />
          ) : (
            <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">
              <AnimatePresence mode="popLayout">
                {messages.map((message) => {
                  const isLastAssistant =
                    message.role === 'assistant' &&
                    messages.filter((m) => m.role === 'assistant').at(-1)?.id === message.id;
                  return (
                    <MessageBubble
                      key={message.id}
                      message={message}
                      onRegenerate={isLastAssistant && !isStreaming ? handleRegenerate : undefined}
                    />
                  );
                })}
              </AnimatePresence>

              <AnimatePresence>
                {isStreaming && <TypingIndicator />}
              </AnimatePresence>

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Follow-up suggestion chips — compact strip shown after first exchange */}
        <AnimatePresence>
          {messages.length > 0 && !isStreaming && document.status === 'DONE' && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.2 }}
              className="border-t border-border/50 bg-background/60 backdrop-blur-sm"
              aria-label="Follow-up suggestions"
            >
              <div className="max-w-4xl mx-auto px-6 py-2 flex gap-2 overflow-x-auto scrollbar-none">
                {FOLLOW_UP_SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => handleSendMessage(suggestion)}
                    className="shrink-0 px-3 py-1.5 rounded-full bg-secondary/50 hover:bg-secondary border border-border/50 hover:border-border text-xs text-muted-foreground hover:text-foreground transition-all duration-200 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <ChatInput
          onSend={handleSendMessage}
          onStop={() => streamAbortRef.current?.abort()}
          isLoading={isStreaming}
          disabled={document.status !== 'DONE'}
          documentStatus={document.status}
        />
      </div>
    </>
  );
};

export default ChatPage;
