import { useRef, useEffect, useCallback, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, FileText, Folder, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import Header from '@/components/app/Header';
import MessageBubble from '@/components/chat/MessageBubble';
import ChatInput from '@/components/chat/ChatInput';
import { EmptyChatState } from '@/components/app/EmptyStates';
import { PdfViewerSheet } from '@/components/chat/PdfViewerSheet';
import TypingIndicator from '@/components/chat/TypingIndicator';
import { useAppStore, type ChatSource } from '@/stores/useAppStore';
import { usePreferencesStore } from '@/stores/usePreferencesStore';
import { sendChatMessage, stopChatStream } from '@/lib/chatStream';
import { fetchCollection } from '@/lib/collections';

const SCROLL_THRESHOLD_PX = 120;

const ChatPage = () => {
  const { documentId, collectionId } = useParams<{
    documentId: string;
    collectionId: string;
  }>();
  const navigate = useNavigate();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [viewerSource, setViewerSource] = useState<ChatSource | null>(null);

  const {
    documents,
    collections,
    upsertCollection,
    accessToken,
    conversations,
    clearConversation,
    removeLastMessages,
  } = useAppStore();
  const autoScrollWhileStreaming = usePreferencesStore((s) => s.autoScrollWhileStreaming);

  // Chat target: a single document, or a collection (key `col:<id>`).
  const chatKey = collectionId ? `col:${collectionId}` : documentId;
  const document = collectionId ? undefined : documents.find((doc) => doc.id === documentId);
  const collection = collectionId ? collections.find((c) => c.id === collectionId) : undefined;

  // Direct navigation to /collection/:id/chat can land before the sidebar has
  // loaded collections — fetch this one directly so the page can render.
  useEffect(() => {
    if (!collectionId || collection || !accessToken) return;
    let cancelled = false;
    fetchCollection(accessToken, collectionId)
      .then((c) => {
        if (!cancelled) upsertCollection(c);
      })
      .catch(() => {
        // Not found / not owned — the not-found state below handles it
      });
    return () => {
      cancelled = true;
    };
  }, [collectionId, collection, accessToken, upsertCollection]);

  const target = collectionId
    ? collection && {
        name: collection.name,
        subtitle: `Chat across ${collection.documentCount} ${collection.documentCount === 1 ? 'document' : 'documents'}`,
        ready: collection.documents.some((d) => d.status === 'DONE'),
      }
    : document && {
        name: document.name,
        subtitle: 'Chat with your document',
        ready: document.status === 'DONE',
      };

  const conversation = chatKey ? conversations[chatKey] : null;
  const messages = conversation?.messages || [];
  const isStreaming = messages.some((m) => m.isStreaming);
  // Model-generated follow-ups from the last completed assistant answer.
  const followUps =
    [...messages].reverse().find((m) => m.role === 'assistant' && !m.isError)
      ?.followUps ?? [];

  // Collection mode: the PDF viewer needs the clicked source's own document.
  const viewerDocumentId = collectionId ? viewerSource?.documentId : documentId;
  const viewerDocumentName = collectionId
    ? viewerSource?.documentName ?? 'Document'
    : document?.name ?? '';

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

  // Streams are owned by chatStream.ts, not this component: navigating away
  // keeps the answer generating in the background (like ChatGPT/Claude).

  // Auto-scroll to bottom while streaming when preference is on (always follow new content).
  useEffect(() => {
    if (!isStreaming || !autoScrollWhileStreaming) return;
    scrollToBottom('instant');
  }, [messages, isStreaming, autoScrollWhileStreaming, scrollToBottom]);

  const handleSendMessage = useCallback(
    (content: string) => {
      if (!chatKey) return;
      void sendChatMessage(chatKey, content);
    },
    [chatKey]
  );

  const handleNewChat = useCallback(() => {
    if (chatKey) {
      stopChatStream(chatKey);
      clearConversation(chatKey);
    }
  }, [chatKey, clearConversation]);

  /**
   * Finds the last user message, removes everything from the last assistant
   * message onwards, then re-sends the user query — works for both
   * Regenerate (successful response) and Retry (error response).
   */
  const handleRegenerate = useCallback(() => {
    if (!chatKey) return;
    const currentMessages = useAppStore.getState().conversations[chatKey]?.messages ?? [];
    const lastUserMsg = [...currentMessages].reverse().find((m) => m.role === 'user');
    if (!lastUserMsg) return;
    const lastAssistantIdx = currentMessages.map((m) => m.role).lastIndexOf('assistant');
    if (lastAssistantIdx === -1) return;
    stopChatStream(chatKey);
    removeLastMessages(chatKey, currentMessages.length - lastAssistantIdx);
    // Defer until the store update has been applied
    setTimeout(() => handleSendMessage(lastUserMsg.content), 0);
  }, [chatKey, removeLastMessages, handleSendMessage]);

  if (!target) {
    return (
      <>
        <Header title="Chat" />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            {collectionId ? (
              <Folder className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            ) : (
              <FileText className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            )}
            <h2 className="text-xl font-semibold mb-2">
              {collectionId ? 'Collection not found' : 'Document not found'}
            </h2>
            <p className="text-muted-foreground mb-4">
              {collectionId
                ? "This collection isn't in your library. It may have been deleted or the link is outdated."
                : "This document isn't in your library. It may have been deleted or the link is outdated."}
            </p>
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
            {collectionId ? (
              <Folder className="w-4 h-4 text-primary" />
            ) : (
              <FileText className="w-4 h-4 text-primary" />
            )}
          </div>
          <div className="min-w-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <h1 className="font-medium truncate max-w-[300px] cursor-default">{target.name}</h1>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs break-words">
                {target.name}
              </TooltipContent>
            </Tooltip>
            <p className="text-xs text-muted-foreground">{target.subtitle}</p>
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
            <EmptyChatState
              onPromptClick={handleSendMessage}
              isLoading={isStreaming}
              summary={document?.summary}
              suggestedQuestions={document?.suggestedQuestions}
            />
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
                      onOpenSource={setViewerSource}
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

        {/* Follow-up chips — parsed from the model's FOLLOWUPS line (zero added latency) */}
        <AnimatePresence>
          {followUps.length > 0 && !isStreaming && target.ready && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.2 }}
              className="border-t border-border/50 bg-background/60 backdrop-blur-sm"
              aria-label="Follow-up suggestions"
            >
              <div className="max-w-4xl mx-auto px-6 py-2 flex gap-2 overflow-x-auto scrollbar-none">
                {followUps.map((suggestion) => (
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
          onStop={() => chatKey && stopChatStream(chatKey)}
          isLoading={isStreaming}
          disabled={!target.ready}
          documentStatus={document ? document.status : target.ready ? 'DONE' : 'PENDING'}
        />
      </div>

      {viewerDocumentId && (
        <PdfViewerSheet
          documentId={viewerDocumentId}
          documentName={viewerDocumentName}
          source={viewerSource}
          onClose={() => setViewerSource(null)}
        />
      )}
    </>
  );
};

export default ChatPage;
