import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { queryClient, queryPersister } from '@/services/api/query-client';
import { AuthProvider } from '@/services/auth/auth-context';
import { AppThemeProvider } from '@/services/theme/app-theme-provider';

const CACHE_MAX_AGE = 12 * 60 * 60 * 1000;

export default function RootLayout() {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: queryPersister,
        buster: 'v1',
        maxAge: CACHE_MAX_AGE,
      }}>
      <SafeAreaProvider>
        <AuthProvider>
          <AppThemeProvider>
            <Stack screenOptions={{ headerShown: false }} />
          </AppThemeProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </PersistQueryClientProvider>
  );
}
