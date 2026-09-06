import { Redirect, type Href } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { useAuth } from '@/services/auth/auth-context';

const STOCK_ROUTE = '/(tabs)/stock' as Href;
const LOGIN_ROUTE = '/(auth)/login' as Href;

export default function IndexRoute() {
  const { isBootstrapping, isAuthenticated } = useAuth();

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

  return <Redirect href={LOGIN_ROUTE} />;
}

