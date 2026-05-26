import { create } from 'zustand';

interface LayoutState {
  catalogWidth: number;
  isCatalogCollapsed: boolean;
  setCatalogWidth: (width: number) => void;
  setIsCatalogCollapsed: (collapsed: boolean) => void;
}

export const useLayoutStore = create<LayoutState>((set) => ({
  catalogWidth: 220,
  isCatalogCollapsed: false,
  setCatalogWidth: (width) => set({ catalogWidth: width }),
  setIsCatalogCollapsed: (collapsed) => set({ isCatalogCollapsed: collapsed }),
}));
