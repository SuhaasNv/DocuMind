import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type DocumentStatus = 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED';

export interface Document {
  id: string;
  name: string;
  uploadedAt: Date;
  status: DocumentStatus;
  progress: number;
  size?: number;
  /** ~3-sentence LLM summary; null until generated (instant activation). */
  summary?: string | null;
  /** Suggested questions the document can answer; null until generated. */
  suggestedQuestions?: string[] | null;
}

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

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  isError?: boolean;
  sources?: ChatSource[];
  /** Follow-up question chips parsed from the answer's FOLLOWUPS line. */
  followUps?: string[];
}

export interface CollectionSummary {
  id: string;
  name: string;
  createdAt: Date;
  documentCount: number;
  documents: { id: string; name: string; status: DocumentStatus }[];
}

export interface Conversation {
  id: string;
  documentId: string;
  messages: Message[];
  createdAt: Date;
}

export interface AppNotification {
  id: string;
  documentId: string;
  documentName: string;
  read: boolean;
  createdAt: number;
}

interface AppState {
  // Auth state
  isAuthenticated: boolean;
  user: { id: string; email: string; name: string; role?: string } | null;
  accessToken: string | null;

  // Documents state
  documents: Document[];
  selectedDocumentId: string | null;

  // Collections state (loaded from backend; not persisted)
  collections: CollectionSummary[];
  setCollections: (collections: CollectionSummary[]) => void;
  upsertCollection: (collection: CollectionSummary) => void;
  removeCollection: (id: string) => void;

  // Chat state
  conversations: Record<string, Conversation>;
  currentConversationId: string | null;

  // UI state
  isSidebarOpen: boolean;
  isUploading: boolean;
  documentSearchQuery: string;
  setDocumentSearchQuery: (query: string) => void;

  // Notifications (document processed, etc.) – not persisted
  notifications: AppNotification[];
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  clearNotifications: () => void;

  // Actions
  setAuthenticated: (auth: boolean, user?: { id: string; email: string; name: string; role?: string } | null, accessToken?: string | null) => void;
  setDocuments: (documents: Document[]) => void;
  addDocument: (doc: Document) => void;
  updateDocument: (id: string, updates: Partial<Document>) => void;
  removeDocument: (id: string) => void;
  selectDocument: (id: string | null) => void;
  addMessage: (documentId: string, message: Message) => void;
  updateMessage: (documentId: string, messageId: string, content: string) => void;
  setStreaming: (documentId: string, messageId: string, isStreaming: boolean) => void;
  setMessageSources: (documentId: string, messageId: string, sources: ChatSource[]) => void;
  setMessageFollowUps: (documentId: string, messageId: string, followUps: string[]) => void;
  setMessageError: (documentId: string, messageId: string) => void;
  clearConversation: (documentId: string) => void;
  removeLastMessages: (documentId: string, count: number) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  isMobileMenuOpen: boolean;
  setMobileMenuOpen: (open: boolean) => void;
  setUploading: (uploading: boolean) => void;
}

const AUTH_STORAGE_KEY = 'insight-garden-auth';

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Initial state
      isAuthenticated: false,
      user: null,
      accessToken: null,
      documents: [],
      selectedDocumentId: null,
      collections: [],
      setCollections: (collections) => set({ collections }),
      upsertCollection: (collection) => set((state) => ({
        collections: state.collections.some((c) => c.id === collection.id)
          ? state.collections.map((c) => (c.id === collection.id ? collection : c))
          : [collection, ...state.collections],
      })),
      removeCollection: (id) => set((state) => ({
        collections: state.collections.filter((c) => c.id !== id),
        conversations: Object.fromEntries(
          Object.entries(state.conversations).filter(([key]) => key !== `col:${id}`)
        ),
      })),
      conversations: {},
      currentConversationId: null,
      isSidebarOpen: true,
      isMobileMenuOpen: false,
      isUploading: false,
      setMobileMenuOpen: (open) => set({ isMobileMenuOpen: open }),
      documentSearchQuery: '',
      setDocumentSearchQuery: (query) => set({ documentSearchQuery: query }),
      notifications: [],
      markNotificationRead: (id) => set((state) => ({
        notifications: state.notifications.map((n) =>
          n.id === id ? { ...n, read: true } : n
        ),
      })),
      markAllNotificationsRead: () => set((state) => ({
        notifications: state.notifications.map((n) => ({ ...n, read: true })),
      })),
      clearNotifications: () => set({ notifications: [] }),
      // Actions
      setAuthenticated: (auth, user = null, accessToken: string | null = null) =>
        set({ isAuthenticated: auth, user, accessToken: auth ? accessToken ?? null : null }),

      setDocuments: (documents) => set((state) => {
        const conversations = { ...state.conversations };
        for (const doc of documents) {
          if (!conversations[doc.id]) {
            conversations[doc.id] = {
              id: `conv-${doc.id}`,
              documentId: doc.id,
              messages: [],
              createdAt: new Date(),
            };
          }
        }
        return { documents, conversations };
      }),

      addDocument: (doc) => set((state) => ({
        documents: [doc, ...state.documents],
        conversations: {
          ...state.conversations,
          [doc.id]: {
            id: `conv-${doc.id}`,
            documentId: doc.id,
            messages: [],
            createdAt: new Date(),
          },
        },
      })),

      updateDocument: (id, updates) => set((state) => {
        const prev = state.documents.find((d) => d.id === id);
        const documents = state.documents.map((doc) =>
          doc.id === id ? { ...doc, ...updates } : doc
        );
        let notifications = state.notifications;
        if (updates.status === 'DONE' && prev?.status !== 'DONE') {
          notifications = [
            {
              id: `notif-${id}-${Date.now()}`,
              documentId: id,
              documentName: prev?.name ?? 'Document',
              read: false,
              createdAt: Date.now(),
            },
            ...notifications,
          ];
        }
        return { documents, notifications };
      }),

      removeDocument: (id) => set((state) => ({
        documents: state.documents.filter((doc) => doc.id !== id),
        conversations: Object.fromEntries(
          Object.entries(state.conversations).filter(([key]) => key !== id)
        ),
        selectedDocumentId: state.selectedDocumentId === id ? null : state.selectedDocumentId,
      })),

      selectDocument: (id) => set({ selectedDocumentId: id }),

      addMessage: (documentId, message) => set((state) => {
        const conversation = state.conversations[documentId] || {
          id: `conv-${documentId}`,
          documentId,
          messages: [],
          createdAt: new Date(),
        };

        return {
          conversations: {
            ...state.conversations,
            [documentId]: {
              ...conversation,
              messages: [...conversation.messages, message],
            },
          },
        };
      }),

      updateMessage: (documentId, messageId, content) => set((state) => {
        const conversation = state.conversations[documentId];
        if (!conversation) return state;

        return {
          conversations: {
            ...state.conversations,
            [documentId]: {
              ...conversation,
              messages: conversation.messages.map((msg) =>
                msg.id === messageId ? { ...msg, content } : msg
              ),
            },
          },
        };
      }),

      setStreaming: (documentId, messageId, isStreaming) => set((state) => {
        const conversation = state.conversations[documentId];
        if (!conversation) return state;

        return {
          conversations: {
            ...state.conversations,
            [documentId]: {
              ...conversation,
              messages: conversation.messages.map((msg) =>
                msg.id === messageId ? { ...msg, isStreaming } : msg
              ),
            },
          },
        };
      }),

      setMessageSources: (documentId, messageId, sources) => set((state) => {
        const conversation = state.conversations[documentId];
        if (!conversation) return state;

        return {
          conversations: {
            ...state.conversations,
            [documentId]: {
              ...conversation,
              messages: conversation.messages.map((msg) =>
                msg.id === messageId ? { ...msg, sources } : msg
              ),
            },
          },
        };
      }),

      setMessageFollowUps: (documentId, messageId, followUps) => set((state) => {
        const conversation = state.conversations[documentId];
        if (!conversation) return state;

        return {
          conversations: {
            ...state.conversations,
            [documentId]: {
              ...conversation,
              messages: conversation.messages.map((msg) =>
                msg.id === messageId ? { ...msg, followUps } : msg
              ),
            },
          },
        };
      }),

      setMessageError: (documentId, messageId) => set((state) => {
        const conv = state.conversations[documentId];
        if (!conv) return state;
        return {
          conversations: {
            ...state.conversations,
            [documentId]: {
              ...conv,
              messages: conv.messages.map((m) =>
                m.id === messageId ? { ...m, isError: true } : m
              ),
            },
          },
        };
      }),

      clearConversation: (documentId) => set((state) => {
        const conv = state.conversations[documentId];
        if (!conv) return state;
        return {
          conversations: {
            ...state.conversations,
            [documentId]: { ...conv, messages: [] },
          },
        };
      }),

      removeLastMessages: (documentId, count) => set((state) => {
        const conv = state.conversations[documentId];
        if (!conv) return state;
        return {
          conversations: {
            ...state.conversations,
            [documentId]: {
              ...conv,
              messages: conv.messages.slice(0, Math.max(0, conv.messages.length - count)),
            },
          },
        };
      }),

      toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
      setSidebarOpen: (open) => set({ isSidebarOpen: open }),
      setUploading: (uploading) => set({ isUploading: uploading }),
    }),
    {
      name: AUTH_STORAGE_KEY,
      partialize: (state) => ({
        isAuthenticated: state.isAuthenticated,
        user: state.user,
        accessToken: state.accessToken,
      }),
    },
  ),
);
