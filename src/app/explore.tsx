import { Redirect, type Href } from 'expo-router';

const RECIPES_ROUTE = '/(tabs)/recipes' as Href;

export default function LegacyExploreRoute() {
  return <Redirect href={RECIPES_ROUTE} />;
}

