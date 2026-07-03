import { create } from 'zustand';
import type { Locale } from '@bomb-squad/shared';

/** Persist the manual language across reloads (a lightweight, self-contained
 *  preference — the rest of uiStore stays in-memory). Guarded for SSR/tests. */
const LOCALE_KEY = 'bombsquad.manualLocale';
const loadLocale = (): Locale => {
  try {
    return localStorage.getItem(LOCALE_KEY) === 'zh' ? 'zh' : 'en';
  } catch {
    return 'en';
  }
};
const saveLocale = (locale: Locale): void => {
  try {
    localStorage.setItem(LOCALE_KEY, locale);
  } catch {
    /* ignore (private mode / no storage) */
  }
};

interface UiState {
  manualOpen: boolean;
  /** Language of the Expert manual (Story: i18n). Persisted to localStorage. */
  manualLocale: Locale;
  /**
   * Current manual chapter (observable position, Story 5.2 AC5 — what the
   * Spectator Lounge mirrors in 9.4). null = viewer not yet positioned.
   * Write via publishManualPosition(), which also emits the typed event;
   * per-chapter scroll offsets are presentation state and stay in refs.
   */
  manualChapterId: string | null;
  activeModuleIndex: number | null;
  setManualOpen: (open: boolean) => void;
  setManualChapterId: (chapterId: string | null) => void;
  setActiveModuleIndex: (index: number | null) => void;
  setManualLocale: (locale: Locale) => void;
}

export const useUiStore = create<UiState>((set) => ({
  manualOpen: false,
  manualChapterId: null,
  activeModuleIndex: null,
  manualLocale: loadLocale(),
  setManualOpen: (manualOpen) => set({ manualOpen }),
  setManualChapterId: (manualChapterId) => set({ manualChapterId }),
  setActiveModuleIndex: (activeModuleIndex) => set({ activeModuleIndex }),
  setManualLocale: (manualLocale) => {
    saveLocale(manualLocale);
    set({ manualLocale });
  },
}));
