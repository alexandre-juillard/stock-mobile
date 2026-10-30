import { Redirect } from 'expo-router';

import { FullScreenLoader } from '@/components/ui/full-screen-loader';
import { LOGIN_ROUTE, STOCK_ROUTE } from '@/constants/routes';
import { useAuth } from '@/services/auth/auth-context';

export default function IndexRoute() {
  const { isBootstrapping, isAuthenticated } = useAuth();

  if (isBootstrapping) {
    return <FullScreenLoader />;
  }

  if (isAuthenticated) {
    return <Redirect href={STOCK_ROUTE} />;
  }

  return <Redirect href={LOGIN_ROUTE} />;
}

