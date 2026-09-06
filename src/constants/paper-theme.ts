import { MD3DarkTheme, MD3LightTheme, type MD3Theme } from 'react-native-paper';

const lightColors = {
  primary: '#2D6A4F',
  onPrimary: '#FFFFFF',
  secondary: '#F4A261',
  onSecondary: '#081C15',
  error: '#D90429',
  onError: '#FFFFFF',
  background: '#F8F9FA',
  onBackground: '#081C15',
  surface: '#FFFFFF',
  onSurface: '#081C15',
  surfaceVariant: '#D8F3DC',
  onSurfaceVariant: '#081C15',
  outline: '#D8DBE2',
} as const;

const darkColors = {
  primary: '#40916C',
  onPrimary: '#081C15',
  secondary: '#F4A261',
  onSecondary: '#081C15',
  error: '#D90429',
  onError: '#FFFFFF',
  background: '#121714',
  onBackground: '#E8ECEA',
  surface: '#1B211D',
  onSurface: '#E8ECEA',
  surfaceVariant: '#244034',
  onSurfaceVariant: '#D8F3DC',
  outline: '#3E4A44',
} as const;

export const lightPaperTheme: MD3Theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    ...lightColors,
  },
};

export const darkPaperTheme: MD3Theme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    ...darkColors,
  },
};

