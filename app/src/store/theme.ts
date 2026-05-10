import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { type Personality, type Density, type Theme, buildTheme } from '../tokens';

interface ThemeState {
  dark: boolean;
  personality: Personality;
  density: Density;
  theme: Theme;
  toggleDark: () => void;
  setPersonality: (p: Personality) => void;
  setDensity: (d: Density) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      dark: true,
      personality: 'hive',
      density: 'cozy',
      theme: buildTheme(true, 'hive', 'cozy'),
      toggleDark: () => {
        const { dark, personality, density } = get();
        const newDark = !dark;
        set({ dark: newDark, theme: buildTheme(newDark, personality, density) });
      },
      setPersonality: (personality) => {
        const { dark, density } = get();
        set({ personality, theme: buildTheme(dark, personality, density) });
      },
      setDensity: (density) => {
        const { dark, personality } = get();
        set({ density, theme: buildTheme(dark, personality, density) });
      },
    }),
    { name: 'hashhive-theme' }
  )
);
