import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';

import { FullScreenLoader } from '@/components/ui/full-screen-loader';
import { LOGIN_ROUTE } from '@/constants/routes';
import { useAuth } from '@/services/auth/auth-context';

export default function TabsLayout() {
  const { isAuthenticated, isBootstrapping } = useAuth();

  if (isBootstrapping) {
    return <FullScreenLoader />;
  }

  if (!isAuthenticated) {
    return <Redirect href={LOGIN_ROUTE} />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#2D6A4F',
      }}>
      <Tabs.Screen
        name="stock"
        options={{
          title: 'Stock',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="fridge-outline" style={{ color }} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="categories"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="recipes"
        options={{
          title: 'Recettes',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="chef-hat" style={{ color }} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="shopping-list"
        options={{
          title: 'Courses',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="cart-outline" style={{ color }} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profil',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="account-circle-outline" style={{ color }} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
