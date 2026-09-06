---
name: "TypeScript React Native Expo Mobile Development Guide"
description: "A comprehensive development guide for building modern mobile applications using TypeScript, React Native, and Expo with best practices, performance optimization, and cross-platform compatibility"
category: "Mobile Development"
author: "Agents.md Collection"
authorUrl: "https://github.com/gakeez/agents_md_collection"
tags:
  [
    "typescript",
    "react-native",
    "expo",
    "mobile",
    "ios",
    "android",
    "cross-platform",
  ]
lastUpdated: "2026-09-04"
---

# TypeScript React Native Expo Mobile Development Guide

## Project Overview

This comprehensive guide outlines best practices for developing modern mobile applications using TypeScript, React Native, and Expo. It emphasizes concise, technical TypeScript code with accurate examples, functional and declarative programming patterns, and cross-platform mobile development excellence. The guide focuses on performance optimization, accessibility, and following Expo's managed workflow for streamlined development and deployment.

## Tech Stack

- **Framework**: React Native 0.86 with Expo SDK 57 (New Architecture, enabled by default and no longer optional since SDK 55+)
- **Language**: TypeScript 6.0 with strict mode
- **Navigation**: Expo Router 6 (file-based routing under `src/app/`) — no manual React Navigation setup (Expo Router wraps it internally)
- **State Management**: React Query for server state; React Context + useReducer for auth/session state; Zustand for lightweight client-only UI state if needed (Redux Toolkit is overkill for this app's scope)
- **Data Fetching**: React Query (TanStack Query) v5, with API hooks generated from the backend OpenAPI spec via `orval` rather than hand-written fetch clients
- **Styling**: `StyleSheet.create` (React Native core) as the default — see all examples below. A component library (e.g. React Native Paper, Material Design 3) may be layered on top for ready-made UI primitives; NativeWind/Tailwind is not used in this project
- **Animation**: React Native Reanimated 4+ (requires the companion `react-native-worklets` package since v4) / React Native Gesture Handler
- **Testing**: Jest + React Native Testing Library (unit/integration) + Maestro (E2E — preferred over Detox for Expo-managed apps, no native build/eject required)
- **Storage**: Expo SecureStore (tokens) + AsyncStorage (non-sensitive cached data)

## Project Structure

Actual layout of this project (`stock-mobile`) — Expo Router auto-detects `src/app` when there is
no `app/` directory at the repository root, which is the convention used here:

```
stock-mobile/
├── src/
│   ├── app/                       # Expo Router pages (file-based routing)
│   │   ├── (auth)/                # Login, register, password reset... (stack, no tab bar)
│   │   ├── (tabs)/                # Stock, Recipes, Shopping list, Profile (bottom tabs)
│   │   ├── _layout.tsx            # Root layout (providers: QueryClient, theme, auth)
│   │   └── index.tsx              # Entry redirect (auth check → (tabs) or (auth))
│   ├── components/
│   │   ├── ui/                    # Reusable UI primitives
│   │   ├── forms/                 # Form components
│   │   └── layout/                # Layout components
│   ├── services/
│   │   ├── api/                   # orval-generated client + hooks (from stock-api OpenAPI spec)
│   │   └── auth/                  # Token storage (SecureStore), auth context
│   ├── store/                     # Zustand stores (client-only UI state, if needed)
│   ├── hooks/                     # Custom hooks
│   ├── utils/                     # Utility functions
│   ├── types/                     # Shared TypeScript type definitions (non-generated)
│   └── constants/                 # App constants (colors, theme tokens...)
├── assets/                        # Images, fonts, app icons (referenced via @/assets/*)
├── docs/                          # Functional specs (screens, flows) — no visual mockups
├── __tests__/                     # Test files
├── app.json                       # Expo configuration
├── tsconfig.json
└── package.json
```

Note: `babel.config.js` / `metro.config.js` are intentionally absent — Expo SDK 57's zero-config
defaults are used unless a specific customization requires overriding them.

## Development Guidelines

### Code Style and Structure

- Write concise, technical TypeScript code with accurate examples
- Use functional and declarative programming patterns; avoid classes
- Prefer iteration and modularization over code duplication
- Use descriptive variable names with auxiliary verbs (e.g., isLoading, hasError)
- Structure files: exported component, subcomponents, helpers, static content, types

### Naming Conventions

- Use lowercase with dashes for directories (e.g., components/auth-wizard)
- Favor named exports for components
- Use PascalCase for component names
- Use camelCase for functions, variables, and props

### TypeScript Usage

```typescript
// Use interfaces over types
interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  preferences: UserPreferences;
}

interface UserPreferences {
  theme: "light" | "dark" | "system";
  notifications: boolean;
  language: string;
}

// Avoid enums; use maps instead
const THEME_OPTIONS = {
  LIGHT: "light",
  DARK: "dark",
  SYSTEM: "system",
} as const;

type ThemeOption = (typeof THEME_OPTIONS)[keyof typeof THEME_OPTIONS];

// Functional components with TypeScript interfaces
interface ProfileCardProps {
  user: UserProfile;
  onEdit: (userId: string) => void;
  isLoading?: boolean;
}

export function ProfileCard({
  user,
  onEdit,
  isLoading = false,
}: ProfileCardProps) {
  const handleEditPress = () => {
    if (!isLoading) onEdit(user.id);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.name}>{user.name}</Text>
      <Text style={styles.email}>{user.email}</Text>
      <TouchableOpacity onPress={handleEditPress} disabled={isLoading}>
        <Text>Edit Profile</Text>
      </TouchableOpacity>
    </View>
  );
}
```

## Environment Setup

### Development Requirements

- Node.js 20 LTS (or newer)
- npm >= 10.0.0 (this project uses npm, not yarn)
- TypeScript 6.0 (managed as a project devDependency, no global install needed)
- Expo Go app (device) for the fastest local preview loop; no Expo CLI global install required (`npx expo` handles it)
- iOS Simulator (Xcode, macOS only) for iOS development
- Android Studio + Android SDK / emulator for Android development

### Installation Steps

```bash
# 1. Clone the repository
git clone https://github.com/<your-account>/stock-mobile.git
cd stock-mobile

# 2. Install dependencies (Expo Router, React Native, Reanimated 4, etc. are already
#    declared in package.json — see actual versions there)
npm install

# 3. Copy the environment file and adjust the API base URL
cp .env.example .env

# 4. Additional dependencies for this project's architecture (add as each feature is built):
npx expo install @tanstack/react-query
npx expo install expo-secure-store @react-native-async-storage/async-storage
npm install -D orval                  # generates the API client/hooks from stock-api's OpenAPI spec
npm install -D jest jest-expo @testing-library/react-native
npm install -D maestro-cli            # E2E testing (installed separately, not an npm dependency — see Maestro docs)

# 5. Start the development server (scan the QR code with Expo Go, or use --tunnel
#    when the device is not on the same Wi-Fi network, e.g. to test the Google OAuth2 flow)
npx expo start
```

### TypeScript Configuration

This is the actual `tsconfig.json` used in this project — a single `@/*` wildcard alias is
preferred over one alias per subfolder (less to maintain as the structure evolves):

```json
// tsconfig.json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    // Recommended additional strictness on top of the defaults already enabled:
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "paths": {
      "@/*": ["./src/*"],
      "@/assets/*": ["./assets/*"]
    }
  },
  "include": ["**/*.ts", "**/*.tsx", ".expo/types/**/*.ts", "expo-env.d.ts"]
}
```


### Expo Configuration

This matches the actual `app.json` used in this project (SDK 50+ replaced the top-level `splash`
object with the `expo-splash-screen` config plugin — using the old `splash` key is deprecated):

```json
// app.json
{
  "expo": {
    "name": "stock-mobile",
    "slug": "stock-mobile",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/images/icon.png",
    "scheme": "stockshop",
    "userInterfaceStyle": "automatic",
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "com.yourcompany.stockmobile"
    },
    "android": {
      "adaptiveIcon": {
        "backgroundColor": "#E6F4FE",
        "foregroundImage": "./assets/images/android-icon-foreground.png",
        "backgroundImage": "./assets/images/android-icon-background.png",
        "monochromeImage": "./assets/images/android-icon-monochrome.png"
      },
      "package": "com.yourcompany.stockmobile"
    },
    "web": {
      "output": "static",
      "favicon": "./assets/images/favicon.png"
    },
    "plugins": [
      "expo-router",
      "expo-secure-store",
      [
        "expo-splash-screen",
        {
          "backgroundColor": "#208AEF",
          "image": "./assets/images/splash-icon.png",
          "imageWidth": 76
        }
      ],
      [
        "expo-image-picker",
        {
          "photosPermission": "The app accesses your photos to let you share them."
        }
      ]
    ],
    "experiments": {
      "typedRoutes": true,
      "reactCompiler": true
    }
  }
}
```

Note: `assetBundlePatterns` and the New Architecture toggle are no longer needed — asset bundling
is handled automatically by Metro/Expo, and the New Architecture is on by default (SDK 55+) with
no opt-out.


## Core Feature Implementation

### Component Architecture

```typescript
// src/components/ui/Button.tsx
import React from "react";
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useColorScheme } from "react-native";

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "outline";
  size?: "small" | "medium" | "large";
  isLoading?: boolean;
  disabled?: boolean;
  testID?: string;
}

export function Button({
  title,
  onPress,
  variant = "primary",
  size = "medium",
  isLoading = false,
  disabled = false,
  testID,
}: ButtonProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const buttonStyles = [
    styles.base,
    styles[size],
    styles[variant],
    isDark && styles.dark,
    (disabled || isLoading) && styles.disabled,
  ];

  const textStyles = [
    styles.text,
    styles[`${variant}Text`],
    isDark && styles.darkText,
  ];

  return (
    <TouchableOpacity
      style={buttonStyles}
      onPress={onPress}
      disabled={disabled || isLoading}
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || isLoading }}
    >
      {isLoading ? (
        <ActivityIndicator color={variant === "primary" ? "#fff" : "#007AFF"} />
      ) : (
        <Text style={textStyles}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  small: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    minHeight: 32,
  },
  medium: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 44,
  },
  large: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    minHeight: 56,
  },
  primary: {
    backgroundColor: "#007AFF",
  },
  secondary: {
    backgroundColor: "#F2F2F7",
  },
  outline: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "#007AFF",
  },
  disabled: {
    opacity: 0.5,
  },
  dark: {
    backgroundColor: "#1C1C1E",
  },
  text: {
    fontSize: 16,
    fontWeight: "600",
  },
  primaryText: {
    color: "#FFFFFF",
  },
  secondaryText: {
    color: "#000000",
  },
  outlineText: {
    color: "#007AFF",
  },
  darkText: {
    color: "#FFFFFF",
  },
});
```

### Safe Area Management

```typescript
// src/components/layout/SafeAreaWrapper.tsx
import React from "react";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "react-native";

interface SafeAreaWrapperProps {
  children: React.ReactNode;
  edges?: ("top" | "bottom" | "left" | "right")[];
}

export function SafeAreaWrapper({
  children,
  edges = ["top", "bottom"],
}: SafeAreaWrapperProps) {
  const colorScheme = useColorScheme();

  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1 }} edges={edges}>
        <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
        {children}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

// src/components/layout/SafeAreaScrollView.tsx
import React from "react";
import { ScrollView, ScrollViewProps } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface SafeAreaScrollViewProps extends ScrollViewProps {
  children: React.ReactNode;
}

export function SafeAreaScrollView({
  children,
  style,
  ...props
}: SafeAreaScrollViewProps) {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={[{ paddingTop: insets.top, paddingBottom: insets.bottom }, style]}
      contentInsetAdjustmentBehavior="automatic"
      {...props}
    >
      {children}
    </ScrollView>
  );
}
```

### Navigation Setup

This project uses **Expo Router** (file-based routing) exclusively — there is no manually created
`NavigationContainer`/`Stack.Navigator` (Expo Router wraps React Navigation internally and
generates routes from the file tree under `src/app/`).

```
src/app/
├── _layout.tsx              # Root layout: providers (QueryClientProvider, theme...) + auth guard
├── index.tsx                # Redirects to (tabs) or (auth) depending on auth state
├── (auth)/
│   ├── _layout.tsx           # Stack layout, no tab bar
│   ├── login.tsx
│   ├── register.tsx
│   └── forgot-password.tsx
└── (tabs)/
    ├── _layout.tsx           # Tab bar layout
    ├── stock/
    │   ├── index.tsx         # Stock list
    │   └── [productId].tsx   # Stock item detail (dynamic route)
    ├── recipes.tsx
    ├── shopping-list.tsx
    └── profile.tsx
```

```typescript
// src/app/_layout.tsx
import { Stack } from "expo-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/services/api/queryClient";

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <Stack screenOptions={{ headerShown: false }} />
    </QueryClientProvider>
  );
}
```

```typescript
// src/app/(tabs)/_layout.tsx
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: "#007AFF" }}>
      <Tabs.Screen
        name="stock"
        options={{
          title: "Stock",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="cube-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen name="recipes" options={{ title: "Recipes" }} />
      <Tabs.Screen name="shopping-list" options={{ title: "Shopping list" }} />
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />
    </Tabs>
  );
}
```

Navigating between screens uses the `router` object or `<Link>` from `expo-router`
(`router.push("/(tabs)/stock/[productId]")`), typed automatically thanks to `experiments.typedRoutes`
in `app.json`.


### State Management

```typescript
// src/store/AuthContext.tsx
import React, { createContext, useContext, useReducer, useEffect } from "react";
import * as SecureStore from "expo-secure-store";

interface User {
  id: string;
  name: string;
  email: string;
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

type AuthAction =
  | { type: "SET_LOADING"; payload: boolean }
  | { type: "SET_USER"; payload: User | null }
  | { type: "LOGOUT" };

const initialState: AuthState = {
  user: null,
  isLoading: true,
  isAuthenticated: false,
};

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case "SET_LOADING":
      return { ...state, isLoading: action.payload };
    case "SET_USER":
      return {
        ...state,
        user: action.payload,
        isAuthenticated: !!action.payload,
        isLoading: false,
      };
    case "LOGOUT":
      return {
        ...state,
        user: null,
        isAuthenticated: false,
        isLoading: false,
      };
    default:
      return state;
  }
}

interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuthStatus: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, initialState);

  const login = async (email: string, password: string) => {
    dispatch({ type: "SET_LOADING", payload: true });

    try {
      // Simulate API call
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (response.ok) {
        await SecureStore.setItemAsync("authToken", data.token);
        dispatch({ type: "SET_USER", payload: data.user });
      } else {
        throw new Error(data.message);
      }
    } catch (error) {
      dispatch({ type: "SET_LOADING", payload: false });
      throw error;
    }
  };

  const logout = async () => {
    await SecureStore.deleteItemAsync("authToken");
    dispatch({ type: "LOGOUT" });
  };

  const checkAuthStatus = async () => {
    try {
      const token = await SecureStore.getItemAsync("authToken");

      if (token) {
        // Validate token with API
        const response = await fetch("/api/me", {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (response.ok) {
          const user = await response.json();
          dispatch({ type: "SET_USER", payload: user });
        } else {
          await SecureStore.deleteItemAsync("authToken");
          dispatch({ type: "SET_USER", payload: null });
        }
      } else {
        dispatch({ type: "SET_USER", payload: null });
      }
    } catch (error) {
      dispatch({ type: "SET_USER", payload: null });
    }
  };

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const value: AuthContextType = {
    ...state,
    login,
    logout,
    checkAuthStatus,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
```

## Data Fetching and API Integration

In this project, API hooks are **generated with `orval`** from `stock-api`'s OpenAPI spec
(`GET /v3/api-docs`), targeting the `react-query` client mode — this avoids hand-writing a generic
`ApiClient` class and per-entity hooks (`useUsers`, `useCreateUser`...) for every endpoint. The
patterns below cover the `QueryClient` setup (still hand-configured) and the orval configuration
that produces those hooks automatically.

### React Query Setup

```typescript
// src/services/api/queryClient.ts
import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes — renamed from "cacheTime" in TanStack Query v5
    },
  },
});
```

### Generating the API client with orval

```typescript
// orval.config.ts
import { defineConfig } from "orval";

export default defineConfig({
  stockApi: {
    input: "http://localhost:8080/v3/api-docs", // or a committed OpenAPI JSON snapshot
    output: {
      mode: "tags-split",              // one folder per OpenAPI tag (category, product, recipe...)
      target: "src/services/api/generated",
      client: "react-query",
      httpClient: "fetch",
      override: {
        mutator: {
          path: "./src/services/api/httpClient.ts",
          name: "apiFetch",             // injects the Authorization header + base URL
        },
      },
    },
  },
});
```

```bash
# Regenerate the client whenever stock-api's OpenAPI contract changes
npx orval
```

```typescript
// src/services/api/httpClient.ts — the custom mutator referenced above
import * as SecureStore from "expo-secure-store";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

export async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const token = await SecureStore.getItemAsync("accessToken");

  const response = await fetch(`${API_BASE_URL}${url}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}
```

Usage in a screen becomes a plain generated hook call, no manual `useQuery`/`useMutation` wiring
needed for endpoints already covered by the OpenAPI spec:

```typescript
// example usage once generated (actual hook names depend on stock-api's OpenAPI operationIds)
import { useGetStockItems, useCreateStockItem } from "@/services/api/generated/stock";

function useStockScreenData() {
  const { data: stockItems, isLoading } = useGetStockItems();
  const createStockItem = useCreateStockItem();

  return { stockItems, isLoading, createStockItem };
}
```


## Performance Optimization

### Image Optimization

```typescript
// src/components/ui/OptimizedImage.tsx
import React, { useState } from "react";
import { View, StyleSheet, ActivityIndicator } from "react-native";
import { Image } from "expo-image";

interface OptimizedImageProps {
  source: string | { uri: string };
  width: number;
  height: number;
  placeholder?: string;
  alt?: string;
  onLoad?: () => void;
  onError?: () => void;
}

export function OptimizedImage({
  source,
  width,
  height,
  placeholder,
  alt,
  onLoad,
  onError,
}: OptimizedImageProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const handleLoad = () => {
    setIsLoading(false);
    onLoad?.();
  };

  const handleError = () => {
    setIsLoading(false);
    setHasError(true);
    onError?.();
  };

  return (
    <View style={[styles.container, { width, height }]}>
      <Image
        source={source}
        style={styles.image}
        placeholder={placeholder}
        contentFit="cover"
        transition={200}
        onLoad={handleLoad}
        onError={handleError}
        accessible={true}
        accessibilityLabel={alt}
      />
      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="small" color="#007AFF" />
        </View>
      )}
      {hasError && (
        <View style={styles.errorOverlay}>
          <Text style={styles.errorText}>Failed to load image</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "relative",
    overflow: "hidden",
    borderRadius: 8,
  },
  image: {
    width: "100%",
    height: "100%",
  },
  loadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.1)",
  },
  errorOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f5f5f5",
  },
  errorText: {
    fontSize: 12,
    color: "#666",
    textAlign: "center",
  },
});
```

### Memoization and Performance

```typescript
// src/components/UserList.tsx
import React, { useMemo, useCallback } from "react";
import { FlatList, View, Text, StyleSheet } from "react-native";
import { useUsers } from "@/hooks/useUsers";

interface User {
  id: string;
  name: string;
  email: string;
}

interface UserListProps {
  searchQuery?: string;
  onUserPress: (userId: string) => void;
}

const UserItem = React.memo(
  ({ user, onPress }: { user: User; onPress: (id: string) => void }) => {
    const handlePress = useCallback(() => {
      onPress(user.id);
    }, [user.id, onPress]);

    return (
      <TouchableOpacity style={styles.userItem} onPress={handlePress}>
        <Text style={styles.userName}>{user.name}</Text>
        <Text style={styles.userEmail}>{user.email}</Text>
      </TouchableOpacity>
    );
  }
);

export function UserList({ searchQuery, onUserPress }: UserListProps) {
  const { data: users, isLoading, error } = useUsers();

  const filteredUsers = useMemo(() => {
    if (!users || !searchQuery) return users || [];

    return users.filter(
      (user) =>
        user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.email.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [users, searchQuery]);

  const renderUser = useCallback(
    ({ item }: { item: User }) => (
      <UserItem user={item} onPress={onUserPress} />
    ),
    [onUserPress]
  );

  const keyExtractor = useCallback((item: User) => item.id, []);

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Failed to load users</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={filteredUsers}
      renderItem={renderUser}
      keyExtractor={keyExtractor}
      removeClippedSubviews={true}
      maxToRenderPerBatch={10}
      windowSize={10}
      initialNumToRender={10}
      getItemLayout={(data, index) => ({
        length: 80,
        offset: 80 * index,
        index,
      })}
    />
  );
}

const styles = StyleSheet.create({
  userItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
    height: 80,
    justifyContent: "center",
  },
  userName: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 14,
    color: "#666",
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  errorText: {
    fontSize: 16,
    color: "#ff3b30",
  },
});
```

## Animation and Gestures

### React Native Reanimated

```typescript
// src/components/ui/AnimatedCard.tsx
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

interface AnimatedCardProps {
  title: string;
  content: string;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
}

export function AnimatedCard({
  title,
  content,
  onSwipeLeft,
  onSwipeRight,
}: AnimatedCardProps) {
  const translateX = useSharedValue(0);
  const opacity = useSharedValue(1);
  const scale = useSharedValue(1);

  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      translateX.value = event.translationX;
      opacity.value = 1 - Math.abs(event.translationX) / 300;
    })
    .onEnd((event) => {
      const shouldDismiss = Math.abs(event.translationX) > 150;

      if (shouldDismiss) {
        translateX.value = withTiming(event.translationX > 0 ? 300 : -300);
        opacity.value = withTiming(0, undefined, () => {
          if (event.translationX > 0 && onSwipeRight) {
            runOnJS(onSwipeRight)();
          } else if (event.translationX < 0 && onSwipeLeft) {
            runOnJS(onSwipeLeft)();
          }
        });
      } else {
        translateX.value = withSpring(0);
        opacity.value = withSpring(1);
      }
    });

  const tapGesture = Gesture.Tap()
    .onBegin(() => {
      scale.value = withSpring(0.95);
    })
    .onFinalize(() => {
      scale.value = withSpring(1);
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <GestureDetector gesture={Gesture.Simultaneous(panGesture, tapGesture)}>
      <Animated.View style={[styles.card, animatedStyle]}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.content}>{content}</Text>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 20,
    margin: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 8,
  },
  content: {
    fontSize: 14,
    color: "#666",
    lineHeight: 20,
  },
});
```

## Testing Strategy

### Unit Testing

```typescript
// __tests__/components/Button.test.tsx
import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { Button } from "@/components/ui/Button";

describe("Button Component", () => {
  it("renders correctly with title", () => {
    const { getByText } = render(
      <Button title="Test Button" onPress={() => {}} />
    );

    expect(getByText("Test Button")).toBeTruthy();
  });

  it("calls onPress when pressed", () => {
    const mockOnPress = jest.fn();
    const { getByRole } = render(
      <Button title="Test Button" onPress={mockOnPress} />
    );

    fireEvent.press(getByRole("button"));
    expect(mockOnPress).toHaveBeenCalledTimes(1);
  });

  it("shows loading indicator when isLoading is true", () => {
    const { getByTestId, queryByText } = render(
      <Button title="Test Button" onPress={() => {}} isLoading={true} />
    );

    expect(queryByText("Test Button")).toBeNull();
    // ActivityIndicator should be present
  });

  it("is disabled when disabled prop is true", () => {
    const mockOnPress = jest.fn();
    const { getByRole } = render(
      <Button title="Test Button" onPress={mockOnPress} disabled={true} />
    );

    const button = getByRole("button");
    expect(button.props.accessibilityState.disabled).toBe(true);

    fireEvent.press(button);
    expect(mockOnPress).not.toHaveBeenCalled();
  });
});
```

### Integration Testing

```typescript
// __tests__/screens/LoginScreen.test.tsx
import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LoginScreen } from "@/components/screens/LoginScreen";
import { AuthProvider } from "@/services/auth/AuthContext";

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

const TestWrapper = ({ children }: { children: React.ReactNode }) => {
  const queryClient = createTestQueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
};

describe("LoginScreen", () => {
  it("renders login form correctly", () => {
    const { getByPlaceholderText, getByText } = render(
      <TestWrapper>
        <LoginScreen />
      </TestWrapper>
    );

    expect(getByPlaceholderText("Email")).toBeTruthy();
    expect(getByPlaceholderText("Password")).toBeTruthy();
    expect(getByText("Login")).toBeTruthy();
  });

  it("shows validation errors for invalid input", async () => {
    const { getByPlaceholderText, getByText, findByText } = render(
      <TestWrapper>
        <LoginScreen />
      </TestWrapper>
    );

    const emailInput = getByPlaceholderText("Email");
    const loginButton = getByText("Login");

    fireEvent.changeText(emailInput, "invalid-email");
    fireEvent.press(loginButton);

    await waitFor(() => {
      expect(findByText("Invalid email address")).toBeTruthy();
    });
  });
});
```

Note: with Expo Router, the route file (e.g. `src/app/(auth)/login.tsx`) stays a thin wrapper that
re-exports a presentational component from `src/components/screens/`. This keeps screen components
directly testable (as above) without pulling in the router at test time.

### E2E Testing

**Maestro** is preferred over Detox for this project: Detox requires a native build (or `expo
prebuild`) to run, while Maestro drives the app through Expo Go / a dev client / a built binary
without any native project setup, which fits Expo's managed workflow much better.

```yaml
# .maestro/login-flow.yaml
appId: fr.stockshop.stockmobile
---
- launchApp
- tapOn: "Email"
- inputText: "user@example.com"
- tapOn: "Password"
- inputText: "Password123!"
- tapOn: "Login"
- assertVisible: "Stock"
```

```bash
# Install once (not an npm dependency): https://maestro.mobile.dev
maestro test .maestro/login-flow.yaml
```

## Error Handling and Validation

### Form Validation with Zod

```typescript
// src/utils/validation.ts
import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export const registerSchema = z
  .object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    email: z.string().email("Invalid email address"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

export type LoginFormData = z.infer<typeof loginSchema>;
export type RegisterFormData = z.infer<typeof registerSchema>;
```

### Error Boundary

```typescript
// src/components/ErrorBoundary.tsx
import React, { Component, ErrorInfo, ReactNode } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);

    // Log to crash reporting service
    // crashlytics().recordError(error);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <View style={styles.container}>
          <Text style={styles.title}>Oops! Something went wrong</Text>
          <Text style={styles.message}>
            We're sorry, but something unexpected happened.
          </Text>
          <TouchableOpacity style={styles.button} onPress={this.handleRetry}>
            <Text style={styles.buttonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    backgroundColor: "#f5f5f5",
  },
  title: {
    fontSize: 24,
    fontWeight: "600",
    color: "#333",
    marginBottom: 16,
    textAlign: "center",
  },
  message: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    marginBottom: 32,
    lineHeight: 24,
  },
  button: {
    backgroundColor: "#007AFF",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
```

## Security and Storage

### Secure Storage Implementation

```typescript
// src/utils/secureStorage.ts
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";

class SecureStorageService {
  private async encrypt(value: string): Promise<string> {
    // In production, use a proper encryption key
    return value; // Simplified for example
  }

  private async decrypt(value: string): Promise<string> {
    // In production, use proper decryption
    return value; // Simplified for example
  }

  async setItem(key: string, value: string): Promise<void> {
    try {
      const encryptedValue = await this.encrypt(value);
      await SecureStore.setItemAsync(key, encryptedValue);
    } catch (error) {
      console.error("Error storing secure item:", error);
      throw error;
    }
  }

  async getItem(key: string): Promise<string | null> {
    try {
      const encryptedValue = await SecureStore.getItemAsync(key);
      if (!encryptedValue) return null;

      return await this.decrypt(encryptedValue);
    } catch (error) {
      console.error("Error retrieving secure item:", error);
      return null;
    }
  }

  async removeItem(key: string): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch (error) {
      console.error("Error removing secure item:", error);
      throw error;
    }
  }

  async clear(): Promise<void> {
    // Note: SecureStore doesn't have a clear all method
    // You need to track keys and remove them individually
    const keysToRemove = ["authToken", "refreshToken", "userPreferences"];

    await Promise.all(keysToRemove.map((key) => this.removeItem(key)));
  }
}

export const secureStorage = new SecureStorageService();
```

## Internationalization

### i18n Setup

```typescript
// src/i18n/index.ts
import * as Localization from 'expo-localization';
import { I18n } from 'i18n-js';

import en from './locales/en.json';
import es from './locales/es.json';
import fr from './locales/fr.json';

const i18n = new I18n({
  en,
  es,
  fr,
});

i18n.locale = Localization.locale;
i18n.enableFallback = true;
i18n.defaultLocale = 'en';

export default i18n;

// src/i18n/locales/en.json
{
  "common": {
    "loading": "Loading...",
    "error": "Error",
    "retry": "Retry",
    "cancel": "Cancel",
    "save": "Save",
    "delete": "Delete"
  },
  "auth": {
    "login": "Login",
    "logout": "Logout",
    "email": "Email",
    "password": "Password",
    "forgotPassword": "Forgot Password?",
    "invalidCredentials": "Invalid email or password"
  },
  "profile": {
    "title": "Profile",
    "editProfile": "Edit Profile",
    "settings": "Settings"
  }
}
```

## Deployment and Distribution

### Build Configuration

```json
// eas.json
{
  "cli": {
    "version": ">= 16.0.0",
    "appVersionSource": "remote"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "channel": "development"
    },
    "preview": {
      "distribution": "internal",
      "channel": "preview",
      "ios": {
        "simulator": true
      }
    },
    "production": {
      "autoIncrement": true,
      "channel": "production",
      "env": {
        "NODE_ENV": "production"
      }
    }
  },
  "submit": {
    "production": {}
  }
}
```

### App Store Optimization

```json
// app.json - Production configuration
{
  "expo": {
    "name": "stock-mobile",
    "slug": "stock-mobile",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/images/icon.png",
    "scheme": "stockshop",
    "userInterfaceStyle": "automatic",
    "updates": {
      "url": "https://u.expo.dev/your-project-id"
    },
    "runtimeVersion": {
      "policy": "appVersion"
    },
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "com.yourcompany.stockmobile",
      "buildNumber": "1",
      "infoPlist": {
        "NSCameraUsageDescription": "This app uses the camera to take photos of your products.",
        "NSPhotoLibraryUsageDescription": "This app accesses your photo library to select images."
      }
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/images/android-icon-foreground.png",
        "backgroundColor": "#FFFFFF"
      },
      "package": "com.yourcompany.stockmobile",
      "versionCode": 1,
      "permissions": [
        "android.permission.CAMERA",
        "android.permission.READ_EXTERNAL_STORAGE"
      ]
    },
    "web": {
      "favicon": "./assets/images/favicon.png"
    },
    "plugins": [
      "expo-router",
      "expo-secure-store",
      ["expo-splash-screen", { "backgroundColor": "#208AEF", "image": "./assets/images/splash-icon.png" }]
    ],
    "extra": {
      "eas": {
        "projectId": "your-project-id"
      }
    }
  }
}
```

Note: `fallbackToCacheTimeout` (in `updates`) was removed in favor of `expo-updates`' newer
`checkAutomatically`/`fallbackToCacheTimeout` runtime config API and is no longer a top-level
`app.json` field; `runtimeVersion.policy: "appVersion"` (rather than `"sdkVersion"`) is recommended
so that OTA updates stay scoped to a given app store release, avoiding native/JS mismatches.


## Common Issues and Solutions

### Issue 1: Metro Bundle Size Too Large

**Solution**:

- Use dynamic imports for large libraries
- Implement code splitting
- Remove unused dependencies
- Use React Native DevTools (built into the framework since RN 0.73+) rather than Flipper, which
  is no longer actively supported on the New Architecture

### Issue 2: Performance Issues on Android

**Solution**:

- Hermes is the default JS engine since Expo SDK 47 / RN 0.70 — there is nothing left to "enable"
- Use FlatList (or FlashList for very large lists) for large datasets
- Optimize images with expo-image
- Avoid unnecessary re-renders

### Issue 3: iOS Build Failures

**Solution**:

- Ensure proper code signing
- Update Xcode and iOS SDK
- Clear derived data
- Check bundle identifier conflicts

### Issue 4: Navigation State Persistence

**Solution**: not applicable the way it is with manual React Navigation — this project uses Expo
Router, which already derives navigation state from the URL and restores it automatically on
reload (web) or relaunch (native, via deep linking). No manual `AsyncStorage` persistence of a
`NavigationContainer` state is needed here.

## Reference Resources

- [Expo Official Documentation](https://docs.expo.dev/)
- [Expo Router Documentation](https://docs.expo.dev/router/introduction/)
- [React Native Documentation](https://reactnative.dev/docs/getting-started)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [React Native Reanimated Documentation](https://docs.swmansion.com/react-native-reanimated/)
- [TanStack Query Documentation](https://tanstack.com/query/latest)
- [orval Documentation](https://orval.dev/)
- [Expo Security Guidelines](https://docs.expo.dev/guides/security/)
- [React Native Testing Library](https://callstack.github.io/react-native-testing-library/)
- [Maestro Documentation](https://maestro.mobile.dev/)
- [EAS Build / Submit / Update Documentation](https://docs.expo.dev/eas/)

## Changelog

### v1.1.0 (2026-09-04)

- Aligned the guide with the actual `stock-mobile` project: Expo SDK 57, React Native 0.86 (New
  Architecture), React 19, TypeScript 6, Expo Router 6 (file-based, `src/app/`)
- Replaced manual React Navigation setup with Expo Router file-based routing
- Replaced the hand-written `ApiClient`/hooks pattern with an `orval`-generated React Query client
  from `stock-api`'s OpenAPI spec, and fixed `cacheTime` → `gcTime` (TanStack Query v5 renaming)
- Replaced Detox with Maestro for E2E testing (no native build required for Expo-managed apps)
- Removed the deprecated top-level `splash` config in favor of the `expo-splash-screen` plugin
- Removed obsolete advice (enabling Hermes, Flipper, manual navigation-state persistence) that no
  longer applies to current Expo/React Native versions

### v1.0.0 (2024-12-19)


- Initial release of TypeScript React Native Expo mobile development guide
- Comprehensive coverage of modern mobile development practices
- Included examples for components, navigation, state management, and testing
- Added performance optimization, security, and deployment considerations
- Covered accessibility, internationalization, and cross-platform compatibility

---

**Note**: This guide has been reviewed and aligned with the actual configuration of the
`stock-mobile` project as of 2026-09-04: Expo SDK 57.0.20, React Native 0.86.3 (New Architecture),
React 19.2.3, TypeScript 6.0.3, Expo Router ~57.0.19 (file-based routing under `src/app/`), and
React Native Reanimated 4.5.1. Data fetching is generated via `orval` (TanStack Query v5) from
`stock-api`'s OpenAPI spec; E2E testing uses Maestro instead of Detox. Re-check this note whenever
a major Expo SDK upgrade is performed on this project, and update the versions/examples above
accordingly. Always refer to the official Expo and React Native documentation for the most
up-to-date information.
