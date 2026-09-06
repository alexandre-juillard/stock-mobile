import { Redirect, Stack, type Href } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { useAuth } from '@/services/auth/auth-context';

const STOCK_ROUTE = '/(tabs)/stock' as Href;

export default function AuthLayout() {
  const { isAuthenticated, isBootstrapping } = useAuth();

  if (isBootstrapping) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (isAuthenticated) {
    return <Redirect href={STOCK_ROUTE} />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    />
  );
}

