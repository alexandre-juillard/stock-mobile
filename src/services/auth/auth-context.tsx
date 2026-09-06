import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { clearTokens, getAccessToken, getRefreshToken, setTokens, type AuthTokens } from './token-storage';

interface AuthContextValue {
  isBootstrapping: boolean;
  isAuthenticated: boolean;
  accessToken: string | null;
  refreshToken: string | null;
  setSession: (tokens: AuthTokens) => Promise<void>;
  clearSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);

  useEffect(() => {
    async function bootstrapSession() {
      try {
        const [storedAccessToken, storedRefreshToken] = await Promise.all([
          getAccessToken(),
          getRefreshToken(),
        ]);

        setAccessToken(storedAccessToken);
        setRefreshToken(storedRefreshToken);
      } finally {
        setIsBootstrapping(false);
      }
    }

    bootstrapSession();
  }, []);

  const setSession = useCallback(async (tokens: AuthTokens) => {
    await setTokens(tokens);
    setAccessToken(tokens.accessToken);
    setRefreshToken(tokens.refreshToken);
  }, []);

  const clearSession = useCallback(async () => {
    await clearTokens();
    setAccessToken(null);
    setRefreshToken(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      isBootstrapping,
      isAuthenticated: Boolean(accessToken && refreshToken),
      accessToken,
      refreshToken,
      setSession,
      clearSession,
    }),
    [accessToken, clearSession, isBootstrapping, refreshToken, setSession]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}

