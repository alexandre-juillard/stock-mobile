import { Redirect, Stack } from 'expo-router';

import { FullScreenLoader } from '@/components/ui/full-screen-loader';
import { STOCK_ROUTE } from '@/constants/routes';
import { useAuth } from '@/services/auth/auth-context';

export default function AuthLayout() {
  const { isAuthenticated, isBootstrapping } = useAuth();

  if (isBootstrapping) {
    return <FullScreenLoader />;
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

