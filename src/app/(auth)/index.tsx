import { Redirect } from 'expo-router';

import { LOGIN_ROUTE } from '@/constants/routes';

export default function AuthIndex() {
  return <Redirect href={LOGIN_ROUTE} />;
}

