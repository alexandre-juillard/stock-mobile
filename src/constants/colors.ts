/**
 * Palette de l'application (charte : docs/screens.md).
 *
 * Les couleurs de marque servent de fonds. Les couleurs portant du texte ou
 * des icônes ("on*", "content") sont choisies pour respecter WCAG 2.2 AA :
 * 4.5:1 pour le texte, 3:1 pour les composants d'interface (bordures, icônes).
 * Toute modification doit garder `npm run check:contrast` au vert.
 */

export const brandColors = {
  green: '#2D6A4F',
  orange: '#F4A261',
  yellow: '#E9C46A',
  red: '#D90429',
  mint: '#D8F3DC',
  ink: '#081C15',
  white: '#FFFFFF',
} as const;

export type StatusTone = 'success' | 'warning' | 'caution' | 'danger' | 'neutral';

export interface StatusColors {
  /** Fond d'un badge ou d'une pastille. */
  container: string;
  /** Texte/icône posé sur `container`. */
  onContainer: string;
  /** Texte/icône posé directement sur le fond ou une carte. */
  content: string;
}

export type StatusPalette = Record<StatusTone, StatusColors>;

export const lightColors = {
  primary: brandColors.green,
  onPrimary: brandColors.white,
  primaryContainer: brandColors.mint,
  onPrimaryContainer: brandColors.ink,
  secondary: brandColors.orange,
  onSecondary: brandColors.ink,
  secondaryContainer: '#FDE3CF',
  onSecondaryContainer: '#3B1F06',
  tertiary: '#36656B',
  onTertiary: brandColors.white,
  tertiaryContainer: '#BCEBF1',
  onTertiaryContainer: '#001F23',
  error: '#C1121F',
  onError: brandColors.white,
  errorContainer: '#FFDAD6',
  onErrorContainer: '#410002',
  background: '#F8F9FA',
  onBackground: brandColors.ink,
  surface: brandColors.white,
  onSurface: brandColors.ink,
  surfaceVariant: '#E1E8E3',
  onSurfaceVariant: '#3F4A44',
  surfaceDisabled: 'rgba(8, 28, 21, 0.12)',
  onSurfaceDisabled: 'rgba(8, 28, 21, 0.38)',
  outline: '#6B7570',
  outlineVariant: '#D8DBE2',
  inverseSurface: '#2C322E',
  inverseOnSurface: '#EEF2EE',
  inversePrimary: '#95D5B2',
  shadow: '#000000',
  scrim: '#000000',
  backdrop: 'rgba(42, 50, 45, 0.4)',
  elevation: {
    level0: 'transparent',
    level1: brandColors.white,
    level2: '#F3F7F4',
    level3: '#EDF3EF',
    level4: '#EAF1EC',
    level5: '#E5EEE8',
  },
} as const;

export const darkColors = {
  primary: '#7CC9A1',
  onPrimary: '#003920',
  primaryContainer: '#1F4D36',
  onPrimaryContainer: '#C7F0D6',
  secondary: brandColors.orange,
  onSecondary: brandColors.ink,
  secondaryContainer: '#5C3A1E',
  onSecondaryContainer: '#FFDCC2',
  tertiary: '#A1CED5',
  onTertiary: '#00363C',
  tertiaryContainer: '#1F4D53',
  onTertiaryContainer: '#BCEBF1',
  error: '#FFB4AB',
  onError: '#690005',
  errorContainer: '#93000A',
  onErrorContainer: '#FFDAD6',
  background: '#121714',
  onBackground: '#E8ECEA',
  surface: '#1B211D',
  onSurface: '#E8ECEA',
  surfaceVariant: '#2E3832',
  onSurfaceVariant: '#BFC9C2',
  surfaceDisabled: 'rgba(232, 236, 234, 0.12)',
  onSurfaceDisabled: 'rgba(232, 236, 234, 0.38)',
  outline: '#89938C',
  outlineVariant: '#3E4A44',
  inverseSurface: '#E8ECEA',
  inverseOnSurface: '#2B312D',
  inversePrimary: brandColors.green,
  shadow: '#000000',
  scrim: '#000000',
  backdrop: 'rgba(0, 0, 0, 0.5)',
  elevation: {
    level0: 'transparent',
    level1: '#1B211D',
    level2: '#202722',
    level3: '#252D27',
    level4: '#272F29',
    level5: '#2A332D',
  },
} as const;

// Les badges gardent les couleurs de marque validées dans les deux modes ;
// seul "Frais" est assombri en mode sombre pour ne pas éblouir.
export const lightStatusColors: StatusPalette = {
  success: { container: brandColors.mint, onContainer: brandColors.ink, content: '#1E6B45' },
  warning: { container: brandColors.yellow, onContainer: brandColors.ink, content: '#755600' },
  caution: { container: brandColors.orange, onContainer: brandColors.ink, content: '#9A4A0E' },
  danger: { container: brandColors.red, onContainer: brandColors.white, content: lightColors.error },
  neutral: { container: '#D8DBE2', onContainer: '#1F2933', content: lightColors.onSurfaceVariant },
};

export const darkStatusColors: StatusPalette = {
  success: { container: '#1F4D36', onContainer: '#C7F0D6', content: '#7FD4A6' },
  warning: { container: brandColors.yellow, onContainer: brandColors.ink, content: brandColors.yellow },
  caution: { container: brandColors.orange, onContainer: brandColors.ink, content: brandColors.orange },
  danger: { container: brandColors.red, onContainer: brandColors.white, content: darkColors.error },
  neutral: { container: '#3A4540', onContainer: '#E1E6E2', content: darkColors.onSurfaceVariant },
};
