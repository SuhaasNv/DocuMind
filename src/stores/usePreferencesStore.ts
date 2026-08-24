import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const PREFERENCES_STORAGE_KEY = 'documind-preferences';

export type DocumentsView = 'grid' | 'list';

interface PreferencesState {
  autoScrollWhileStreaming: boolean;
  showSourcesUnderAnswers: boolean;
  enableAnimations: boolean;
  typewriterEffect: boolean;
  showRetrievalDebug: boolean;
  documentsView: DocumentsView;
  setAutoScrollWhileStreaming: (value: boolean) => void;
  setShowSourcesUnderAnswers: (value: boolean) => void;
  setEnableAnimations: (value: boolean) => void;
  setTypewriterEffect: (value: boolean) => void;
  setShowRetrievalDebug: (value: boolean) => void;
  setDocumentsView: (value: DocumentsView) => void;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      autoScrollWhileStreaming: true,
      showSourcesUnderAnswers: true,
      enableAnimations: true,
      typewriterEffect: true,
      showRetrievalDebug: false,
      documentsView: 'list',
      setDocumentsView: (value) => set({ documentsView: value }),
      setTypewriterEffect: (value) => set({ typewriterEffect: value }),
      setShowRetrievalDebug: (value) => set({ showRetrievalDebug: value }),
      setAutoScrollWhileStreaming: (value) => set({ autoScrollWhileStreaming: value }),
      setShowSourcesUnderAnswers: (value) => set({ showSourcesUnderAnswers: value }),
      setEnableAnimations: (value) => set({ enableAnimations: value }),
    }),
    { name: PREFERENCES_STORAGE_KEY }
  )
);
