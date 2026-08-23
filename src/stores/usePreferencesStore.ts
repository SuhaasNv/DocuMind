import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const PREFERENCES_STORAGE_KEY = 'documind-preferences';

interface PreferencesState {
  autoScrollWhileStreaming: boolean;
  showSourcesUnderAnswers: boolean;
  enableAnimations: boolean;
  typewriterEffect: boolean;
  showRetrievalDebug: boolean;
  setAutoScrollWhileStreaming: (value: boolean) => void;
  setShowSourcesUnderAnswers: (value: boolean) => void;
  setEnableAnimations: (value: boolean) => void;
  setTypewriterEffect: (value: boolean) => void;
  setShowRetrievalDebug: (value: boolean) => void;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      autoScrollWhileStreaming: true,
      showSourcesUnderAnswers: true,
      enableAnimations: true,
      typewriterEffect: true,
      showRetrievalDebug: false,
      setTypewriterEffect: (value) => set({ typewriterEffect: value }),
      setShowRetrievalDebug: (value) => set({ showRetrievalDebug: value }),
      setAutoScrollWhileStreaming: (value) => set({ autoScrollWhileStreaming: value }),
      setShowSourcesUnderAnswers: (value) => set({ showSourcesUnderAnswers: value }),
      setEnableAnimations: (value) => set({ enableAnimations: value }),
    }),
    { name: PREFERENCES_STORAGE_KEY }
  )
);
