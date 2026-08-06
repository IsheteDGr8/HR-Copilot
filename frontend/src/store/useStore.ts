import { create } from 'zustand';

interface CanvasState {
  view: string | null;
  data: any;
}

interface AppState {
  canvasState: CanvasState;
  setCanvasState: (state: CanvasState) => void;
  messages: Array<{ role: 'user' | 'assistant', content: string }>;
  addMessage: (message: { role: 'user' | 'assistant', content: string }) => void;
}

export const useStore = create<AppState>((set) => ({
  canvasState: { view: null, data: null },
  setCanvasState: (canvasState) => set({ canvasState }),
  messages: [],
  addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
}));
