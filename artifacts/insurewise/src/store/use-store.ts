import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ChatMessage, ApplicationConfirmation } from '@workspace/api-client-react';
import { applyColorTheme, type ColorTheme } from '@/lib/color-theme';

interface AppState {
  userProfileId: string | null;
  setUserProfileId: (id: string | null) => void;
  chatHistory: ChatMessage[];
  setChatHistory: (messages: ChatMessage[]) => void;
  addChatMessage: (message: ChatMessage) => void;
  clearChat: () => void;
  confirmationData: ApplicationConfirmation | null;
  setConfirmationData: (data: ApplicationConfirmation | null) => void;
  colorTheme: ColorTheme;
  setColorTheme: (theme: ColorTheme) => void;
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      userProfileId: null,
      setUserProfileId: (id) => set({ userProfileId: id }),
      chatHistory: [],
      setChatHistory: (messages) => set({ chatHistory: messages }),
      addChatMessage: (message) => set((state) => ({ chatHistory: [...state.chatHistory, message] })),
      clearChat: () => set({ chatHistory: [] }),
      confirmationData: null,
      setConfirmationData: (data) => set({ confirmationData: data }),
      colorTheme: 'classic',
      setColorTheme: (theme) => {
        const resolved = applyColorTheme(theme);
        set({ colorTheme: resolved });
      },
    }),
    {
      name: 'insurewise-storage',
      onRehydrateStorage: () => (state) => {
        if (state?.colorTheme) {
          applyColorTheme(state.colorTheme);
        }
      },
    }
  )
);
