import type { QueryClient } from '@tanstack/react-query';
import { ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect, type PropsWithChildren } from 'react';
import { PaperProvider } from 'react-native-paper';

import { getThemes, type ColorSchemeName } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  useGetProfile,
  type getProfileResponse,
} from '@/services/api/generated/profil-utilisateur/profil-utilisateur';
import { queryKeys } from '@/services/api/query-keys';
import { useAuth } from '@/services/auth/auth-context';

function toColorScheme(value: string | null | undefined): ColorSchemeName | null {
  return value === 'light' || value === 'dark' ? value : null;
}

/**
 * Applique immédiatement le thème choisi dans le profil, y compris hors ligne :
 * le cache du profil (persisté) sert de source de vérité au thème affiché.
 */
export function applyProfileThemeOptimistically(
  queryClient: QueryClient,
  theme: ColorSchemeName
): void {
  queryClient.setQueryData<getProfileResponse>(queryKeys.profile.detail, (current) =>
    current ? { ...current, data: { ...current.data, theme } } : current
  );
}

/**
 * Thème affiché : choix enregistré dans le profil si l'utilisateur est
 * connecté, sinon réglage clair/sombre du système.
 */
export function AppThemeProvider({ children }: PropsWithChildren) {
  const systemScheme = useColorScheme();
  const { isAuthenticated } = useAuth();
  const profileQuery = useGetProfile({ query: { enabled: isAuthenticated } });

  const profileScheme = isAuthenticated ? toColorScheme(profileQuery.data?.data?.theme) : null;
  const scheme = profileScheme ?? (systemScheme === 'dark' ? 'dark' : 'light');
  const { theme, navigationTheme } = getThemes(scheme);

  // Fond natif de la fenêtre : évite un flash clair lors des transitions en mode sombre.
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(theme.colors.background);
  }, [theme.colors.background]);

  return (
    <PaperProvider theme={theme}>
      <ThemeProvider value={navigationTheme}>
        <StatusBar style={theme.dark ? 'light' : 'dark'} />
        {children}
      </ThemeProvider>
    </PaperProvider>
  );
}
