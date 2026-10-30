import { StyleSheet, type ImageStyle, type TextStyle, type ViewStyle } from 'react-native';
import { useTheme } from 'react-native-paper';

import type { AppTheme } from '@/constants/theme';

type NamedStyles<T> = { [Key in keyof T]: ViewStyle | TextStyle | ImageStyle };

export function useAppTheme(): AppTheme {
  return useTheme<AppTheme>();
}

/**
 * Crée un hook de styles dépendant du thème. Les feuilles de style sont
 * calculées une seule fois par thème (clair/sombre) puis réutilisées.
 *
 * const useStyles = makeStyles((theme) => ({ title: { color: theme.colors.primary } }));
 */
export function makeStyles<T extends NamedStyles<T>>(factory: (theme: AppTheme) => T) {
  const cache = new WeakMap<AppTheme, T>();

  return function useStyles(): T {
    const theme = useAppTheme();
    let styles = cache.get(theme);

    if (!styles) {
      styles = StyleSheet.create(factory(theme));
      cache.set(theme, styles);
    }

    return styles;
  };
}
