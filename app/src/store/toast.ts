import { create } from 'zustand';

export type ToastKind = 'success' | 'error' | 'info' | 'warning';

export interface ToastItem {
  id: string;
  message: string;
  kind: ToastKind;
}

interface ToastStore {
  toasts: ToastItem[];
  show: (message: string, kind?: ToastKind, duration?: number) => void;
  dismiss: (id: string) => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  show: (message, kind = 'success', duration = 3000) => {
    const id = Math.random().toString(36).slice(2);
    set(s => ({ toasts: [...s.toasts, { id, message, kind }] }));
    if (duration > 0) {
      setTimeout(() => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })), duration);
    }
  },
  dismiss: (id) => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),
}));

export function toast(message: string, kind: ToastKind = 'success') {
  useToastStore.getState().show(message, kind);
}
