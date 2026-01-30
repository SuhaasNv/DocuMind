import { create } from 'zustand';

export type DocumentStatus = 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED';

export interface Document {
  id: string;
  name: string;
  uploadedAt: Date;
  status: DocumentStatus;
  progress: number;
  size?: number;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
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

  // Documents state
  documents: Document[];
  selectedDocumentId: string | null;

  // Chat state
  conversations: Record<string, Conversation>;
  currentConversationId: string | null;

  // UI state
  isSidebarOpen: boolean;
  isUploading: boolean;

  // Actions
  setAuthenticated: (auth: boolean, user?: { id: string; email: string; name: string } | null) => void;
  addDocument: (doc: Document) => void;
  updateDocument: (id: string, updates: Partial<Document>) => void;
  removeDocument: (id: string) => void;
  selectDocument: (id: string | null) => void;
  addMessage: (documentId: string, message: Message) => void;
  updateMessage: (documentId: string, messageId: string, content: string) => void;
  setStreaming: (documentId: string, messageId: string, isStreaming: boolean) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setUploading: (uploading: boolean) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  // Initial state
  isAuthenticated: false,
  user: null,
  documents: [],
  selectedDocumentId: null,
  conversations: {},
  currentConversationId: null,
  isSidebarOpen: true,
  isUploading: false,

  // Actions
  setAuthenticated: (auth, user = null) => set({ isAuthenticated: auth, user }),

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

  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
  setSidebarOpen: (open) => set({ isSidebarOpen: open }),
  setUploading: (uploading) => set({ isUploading: uploading }),
}));
