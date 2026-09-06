import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { darkPaperTheme, lightPaperTheme } from '@/constants/paper-theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { queryClient, queryPersister } from '@/services/api/query-client';
import { AuthProvider } from '@/services/auth/auth-context';

const CACHE_MAX_AGE = 12 * 60 * 60 * 1000;

export default function RootLayout() {
  const scheme = useColorScheme();
  const theme = scheme === 'dark' ? darkPaperTheme : lightPaperTheme;

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: queryPersister,
        buster: 'v1',
        maxAge: CACHE_MAX_AGE,
      }}>
      <SafeAreaProvider>
        <PaperProvider theme={theme}>
          <AuthProvider>
            <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
            <Stack screenOptions={{ headerShown: false }} />
          </AuthProvider>
        </PaperProvider>
      </SafeAreaProvider>
    </PersistQueryClientProvider>
  );
}
