import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Redirect, Tabs, type Href } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { useAuth } from '@/services/auth/auth-context';

const LOGIN_ROUTE = '/(auth)/login' as Href;

export default function TabsLayout() {
  const { isAuthenticated, isBootstrapping } = useAuth();

  if (isBootstrapping) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
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
            <MaterialCommunityIcons name="fridge-outline" color={color} size={size} />
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
            <MaterialCommunityIcons name="chef-hat" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="shopping-list"
        options={{
          title: 'Courses',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="cart-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profil',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="account-circle-outline" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}

