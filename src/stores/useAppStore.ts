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
}

export interface ChatSource {
  chunkIndex: number;
  score: number;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  sources?: ChatSource[];
}

export interface Conversation {
  id: string;
  documentId: string;
  messages: Message[];
  createdAt: Date;
}

interface AppState {
  // Auth state
  isAuthenticated: boolean;
  user: { id: string; email: string; name: string } | null;
  accessToken: string | null;

  // Documents state
  documents: Document[];
  selectedDocumentId: string | null;

  // Chat state
  conversations: Record<string, Conversation>;
  currentConversationId: string | null;

  // UI state
  isSidebarOpen: boolean;
  isUploading: boolean;
  documentSearchQuery: string;
  setDocumentSearchQuery: (query: string) => void;
  /** Mobile only: sheet (drawer) open state. Not persisted. */
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (open: boolean) => void;

  // SSE abort (not persisted): call to abort active chat stream on logout
  abortActiveSSE: (() => void) | null;
  setAbortActiveSSE: (fn: (() => void) | null) => void;

  // Actions
  setAuthenticated: (auth: boolean, user?: { id: string; email: string; name: string } | null, accessToken?: string | null) => void;
  setDocuments: (documents: Document[]) => void;
  addDocument: (doc: Document) => void;
  updateDocument: (id: string, updates: Partial<Document>) => void;
  removeDocument: (id: string) => void;
  selectDocument: (id: string | null) => void;
  addMessage: (documentId: string, message: Message) => void;
  updateMessage: (documentId: string, messageId: string, content: string) => void;
  setStreaming: (documentId: string, messageId: string, isStreaming: boolean) => void;
  setMessageSources: (documentId: string, messageId: string, sources: ChatSource[]) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
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
      conversations: {},
      currentConversationId: null,
      isSidebarOpen: true,
      isUploading: false,
      documentSearchQuery: '',
      setDocumentSearchQuery: (query) => set({ documentSearchQuery: query }),
      mobileMenuOpen: false,
      setMobileMenuOpen: (open) => set({ mobileMenuOpen: open }),
      abortActiveSSE: null,
      setAbortActiveSSE: (fn) => set({ abortActiveSSE: fn }),

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

  updateDocument: (id, updates) => set((state) => ({
    documents: state.documents.map((doc) =>
      doc.id === id ? { ...doc, ...updates } : doc
    ),
  })),

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
        // do not persist abortActiveSSE
      }),
    },
  ),
);
