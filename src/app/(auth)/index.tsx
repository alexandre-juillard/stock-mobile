import { Redirect, type Href } from 'expo-router';

const LOGIN_ROUTE = '/(auth)/login' as Href;

export default function AuthIndex() {
  return <Redirect href={LOGIN_ROUTE} />;
}

