import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useEditorStore } from './index';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export interface ThemeState {
  theme: ThemeMode;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  initTheme: () => () => void;
}

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyThemeToDOM(resolvedTheme: ResolvedTheme) {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', resolvedTheme);
  }
}

function syncLocalStorage(theme: ThemeMode) {
  try {
    localStorage.setItem('duet_theme_mode', theme);
  } catch {
    // Ignore localStorage access errors
  }
}

export function resetAllCodeBlocksToAuto() {
  const editor = useEditorStore.getState().editorInstance;
  if (!editor || editor.isDestroyed) return;

  const { doc, tr } = editor.state;
  let modified = false;
  doc.descendants((node, pos) => {
    if (node.type.name === 'codeBlock') {
      if (node.attrs.theme !== 'auto') {
        tr.setNodeMarkup(pos, undefined, {
          ...node.attrs,
          theme: 'auto',
        });
        modified = true;
      }
    }
  });

  if (modified) {
    editor.view.dispatch(tr);
  }
}

function getInitialTheme(): { theme: ThemeMode; resolvedTheme: ResolvedTheme } {
  let theme: ThemeMode = 'light';
  try {
    const stored = localStorage.getItem('duet_theme_mode') as ThemeMode | null;
    if (stored && (stored === 'light' || stored === 'dark' || stored === 'system')) {
      theme = stored;
    }
  } catch {
    // Ignore localStorage access errors
  }

  const resolvedTheme = theme === 'system' ? getSystemTheme() : theme;
  return { theme, resolvedTheme };
}

const initial = getInitialTheme();
applyThemeToDOM(initial.resolvedTheme);

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: initial.theme,
      resolvedTheme: initial.resolvedTheme,

      setTheme: (newTheme: ThemeMode) => {
        syncLocalStorage(newTheme);
        const resolved = newTheme === 'system' ? getSystemTheme() : newTheme;
        set({ theme: newTheme, resolvedTheme: resolved });
        applyThemeToDOM(resolved);

        // Notify and reset any manually overridden code blocks to auto
        window.dispatchEvent(
          new CustomEvent('duet:theme-changed', {
            detail: { theme: newTheme, resolvedTheme: resolved },
          }),
        );
        resetAllCodeBlocksToAuto();
      },

      toggleTheme: () => {
        const current = get().resolvedTheme;
        const next: ThemeMode = current === 'dark' ? 'light' : 'dark';
        get().setTheme(next);
      },

      initTheme: () => {
        if (typeof window === 'undefined') return () => {};

        // Ensure DOM has initial theme applied
        const currentTheme = get().theme;
        const currentResolved: ResolvedTheme =
          currentTheme === 'system' ? getSystemTheme() : currentTheme;
        set({ resolvedTheme: currentResolved });
        applyThemeToDOM(currentResolved);

        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const handleChange = (e: MediaQueryListEvent) => {
          if (get().theme === 'system') {
            const newResolved = e.matches ? 'dark' : 'light';
            set({ resolvedTheme: newResolved });
            applyThemeToDOM(newResolved);
            window.dispatchEvent(
              new CustomEvent('duet:theme-changed', {
                detail: { theme: 'system', resolvedTheme: newResolved },
              }),
            );
            resetAllCodeBlocksToAuto();
          }
        };

        mediaQuery.addEventListener('change', handleChange);
        return () => {
          mediaQuery.removeEventListener('change', handleChange);
        };
      },
    }),
    {
      name: 'duet-theme-storage',
      partialize: (state) => ({ theme: state.theme }),
    },
  ),
);
