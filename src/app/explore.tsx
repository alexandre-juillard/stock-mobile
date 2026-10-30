import { Redirect } from 'expo-router';

import { RECIPES_ROUTE } from '@/constants/routes';

export default function LegacyExploreRoute() {
  return <Redirect href={RECIPES_ROUTE} />;
}

