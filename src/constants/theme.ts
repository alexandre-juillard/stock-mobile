import { DarkTheme, DefaultTheme, type Theme as NavigationTheme } from 'expo-router';
import { MD3DarkTheme, MD3LightTheme, type MD3Theme } from 'react-native-paper';

import {
  darkColors,
  darkStatusColors,
  lightColors,
  lightStatusColors,
  type StatusPalette,
} from '@/constants/colors';

export type ColorSchemeName = 'light' | 'dark';

export interface AppTheme extends MD3Theme {
  status: StatusPalette;
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const;

// Langage de forme (docs/screens.md) : badges 8–12, champs 12, cartes 16–20, modales 28.
export const radius = {
  badge: 10,
  input: 12,
  card: 16,
  cardLarge: 20,
  sheet: 28,
  pill: 999,
} as const;

export const lightTheme: AppTheme = {
  ...MD3LightTheme,
  dark: false,
  roundness: 4,
  colors: { ...MD3LightTheme.colors, ...lightColors },
  status: lightStatusColors,
};

export const darkTheme: AppTheme = {
  ...MD3DarkTheme,
  dark: true,
  roundness: 4,
  colors: { ...MD3DarkTheme.colors, ...darkColors },
  status: darkStatusColors,
};

function toNavigationTheme(theme: AppTheme, base: NavigationTheme): NavigationTheme {
  return {
    ...base,
    dark: theme.dark,
    colors: {
      primary: theme.colors.primary,
      background: theme.colors.background,
      card: theme.colors.surface,
      text: theme.colors.onSurface,
      border: theme.colors.outlineVariant,
      notification: theme.colors.error,
    },
  };
}

// Sans ce thème, les écrans Expo Router gardent un fond clair par défaut,
// même quand Paper affiche un texte clair en mode sombre.
export const lightNavigationTheme = toNavigationTheme(lightTheme, DefaultTheme);
export const darkNavigationTheme = toNavigationTheme(darkTheme, DarkTheme);

export function getThemes(scheme: ColorSchemeName) {
  return scheme === 'dark'
    ? { theme: darkTheme, navigationTheme: darkNavigationTheme }
    : { theme: lightTheme, navigationTheme: lightNavigationTheme };
}
