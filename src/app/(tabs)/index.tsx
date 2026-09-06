import { Redirect, type Href } from 'expo-router';

const STOCK_ROUTE = '/(tabs)/stock' as Href;

export default function TabsIndex() {
  return <Redirect href={STOCK_ROUTE} />;
}

