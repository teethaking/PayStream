import { create } from 'zustand';

export type ToastKind = 'success' | 'error' | 'info' | 'blocked';
export interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  message?: string;
  href?: string;
}

let seq = 0;
export const useToasts = create<{ toasts: Toast[] }>(() => ({ toasts: [] }));

export function toast(t: Omit<Toast, 'id'>, ttl = 6000) {
  const id = ++seq;
  useToasts.setState((s) => ({ toasts: [...s.toasts.slice(-3), { ...t, id }] }));
  setTimeout(() => dismissToast(id), ttl);
  return id;
}

export const dismissToast = (id: number) => useToasts.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
