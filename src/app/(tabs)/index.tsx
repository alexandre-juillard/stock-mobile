import { Redirect } from 'expo-router';

import { STOCK_ROUTE } from '@/constants/routes';

export default function TabsIndex() {
  return <Redirect href={STOCK_ROUTE} />;
}

