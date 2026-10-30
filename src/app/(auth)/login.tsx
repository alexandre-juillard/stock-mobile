import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { Link, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';
import { Button, Checkbox, HelperText, Snackbar, Text, useTheme } from 'react-native-paper';

import { FormTextField } from '@/components/ui/form-text-field';
import { PasswordTextField } from '@/components/ui/password-text-field';
import { ScreenShell } from '@/components/ui/screen-shell';
import {
  FORGOT_PASSWORD_ROUTE,
  OAUTH_LINK_ROUTE,
  REGISTER_ROUTE,
  STOCK_ROUTE,
} from '@/constants/routes';
import { useIsOffline } from '@/hooks/use-is-offline';
import { logout as revokeRefreshToken } from '@/services/api/generated/authentification/authentification';
import { useAuth } from '@/services/auth/auth-context';
import { loginWithGoogle, loginWithPassword } from '@/services/auth/auth-api';
import { flushPendingLogoutRevokes } from '@/services/offline/logout-revoke-queue';
import { mapErrorToUi } from '@/utils/error-mapper';
import { getFirstRouteParam } from '@/utils/route-params';
import { loginSchema, type LoginFormValues } from '@/utils/validation';

export default function LoginScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ notice?: string | string[] }>();
  const { setSession } = useAuth();
  const isOffline = useIsOffline();
  const theme = useTheme();

  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null);
  const [dismissedRouteNoticeKey, setDismissedRouteNoticeKey] = useState<string | null>(null);

  const routeNoticeKey = getFirstRouteParam(params.notice);
  const routeNotice =
    routeNoticeKey === 'reset-link-sent'
      ? 'Lien de reinitialisation envoye. Verifie ta boite mail.'
      : routeNoticeKey === 'password-reset-success'
        ? 'Mot de passe mis a jour. Tu peux te connecter.'
        : null;

  const displayedSnackbarMessage =
    snackbarMessage ?? (routeNotice && dismissedRouteNoticeKey !== routeNoticeKey ? routeNotice : null);

  const { control, handleSubmit, formState } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
      rememberMe: false,
    },
  });

  const loginMutation = useMutation({
    mutationFn: loginWithPassword,
  });

  const googleMutation = useMutation({
    mutationFn: loginWithGoogle,
  });

  const isSubmitting = loginMutation.isPending || googleMutation.isPending;

  useEffect(() => {
    if (isOffline || isSubmitting) {
      return;
    }

    let isCancelled = false;

    async function flushQueuedLogoutRevokes() {
      const result = await flushPendingLogoutRevokes(async (refreshToken) => {
        await revokeRefreshToken({ refreshToken });
      });

      if (isCancelled) {
        return;
      }

      if (result.status === 'synced' && result.syncedCount > 0) {
        setSnackbarMessage('Deconnexion precedente synchronisee.');
      }

      if (result.status === 'failed' && result.failedCount > 0) {
        setSnackbarMessage('Certains jetons de deconnexion n ont pas pu etre revoques.');
      }
    }

    void flushQueuedLogoutRevokes();

    return () => {
      isCancelled = true;
    };
  }, [isOffline, isSubmitting]);

  const handleLogin = handleSubmit(async (values) => {
    if (isOffline) {
      setSnackbarMessage('Connexion indisponible hors ligne');
      return;
    }

    try {
      const loginResponse = await loginMutation.mutateAsync(values);

      if (!loginResponse.accessToken || !loginResponse.refreshToken) {
        throw new Error('Jetons de connexion manquants');
      }

      await setSession({
        accessToken: loginResponse.accessToken,
        refreshToken: loginResponse.refreshToken,
      });
      router.replace(STOCK_ROUTE);
    } catch (error) {
      setSnackbarMessage(mapErrorToUi(error).message);
    }
  });

  const handleGoogleLogin = async () => {
    if (isOffline) {
      setSnackbarMessage('Connexion Google indisponible hors ligne');
      return;
    }

    try {
      const exchangeResult = await googleMutation.mutateAsync();

      if (exchangeResult.linkRequired) {
        router.push({
          pathname: OAUTH_LINK_ROUTE,
          params: { linkContext: exchangeResult.linkRequired.linkContext },
        } as Href);
        return;
      }

      if (!exchangeResult.tokens?.accessToken || !exchangeResult.tokens.refreshToken) {
        throw new Error('Jetons de connexion Google manquants');
      }

      await setSession({
        accessToken: exchangeResult.tokens.accessToken,
        refreshToken: exchangeResult.tokens.refreshToken,
      });

      router.replace(STOCK_ROUTE);
    } catch (error) {
      setSnackbarMessage(mapErrorToUi(error).message);
    }
  };

  return (
    <ScreenShell
      title="Connexion"
      subtitle="Connecte-toi avec ton email/mot de passe ou Google.">
      <Controller
        control={control}
        name="email"
        render={({ field: { value, onBlur, onChange } }) => (
          <FormTextField
            label="Email"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            value={value}
            onBlur={onBlur}
            onChangeText={onChange}
            error={Boolean(formState.errors.email)}
          />
        )}
      />
      <HelperText type="error" visible={Boolean(formState.errors.email)}>
        {formState.errors.email?.message}
      </HelperText>

      <Controller
        control={control}
        name="password"
        render={({ field: { value, onBlur, onChange } }) => (
          <PasswordTextField
            label="Mot de passe"
            autoCapitalize="none"
            value={value}
            onBlur={onBlur}
            onChangeText={onChange}
            error={Boolean(formState.errors.password)}
          />
        )}
      />
      <HelperText type="error" visible={Boolean(formState.errors.password)}>
        {formState.errors.password?.message}
      </HelperText>

      <Controller
        control={control}
        name="rememberMe"
        render={({ field: { value, onChange } }) => (
          <View style={styles.row}>
            <Checkbox status={value ? 'checked' : 'unchecked'} onPress={() => onChange(!value)} />
            <Text style={{ color: theme.colors.onSurface }}>Se souvenir de moi</Text>
          </View>
        )}
      />

      <Button mode="contained" onPress={() => void handleLogin()} loading={loginMutation.isPending} disabled={isSubmitting}>
        Se connecter
      </Button>

      <Button
        mode="outlined"
        icon="google"
        onPress={handleGoogleLogin}
        loading={googleMutation.isPending}
        disabled={isSubmitting}>
        Continuer avec Google
      </Button>

      {isOffline ? (
        <Text style={styles.offlineText}>Tu es hors ligne: la connexion necessite Internet.</Text>
      ) : null}

      <View style={styles.links}>
        <Link href={REGISTER_ROUTE} style={styles.link}>
          Creer un compte
        </Link>
        <Link href={FORGOT_PASSWORD_ROUTE} style={styles.link}>
          Mot de passe oublie
        </Link>
      </View>

      <Snackbar
        visible={Boolean(displayedSnackbarMessage)}
        onDismiss={() => {
          if (snackbarMessage) {
            setSnackbarMessage(null);
            return;
          }

          if (routeNoticeKey) {
            setDismissedRouteNoticeKey(routeNoticeKey);
          }
        }}
        duration={4000}>
        {displayedSnackbarMessage}
      </Snackbar>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  links: {
    marginTop: 8,
    gap: 8,
    alignItems: 'center',
  },
  link: {
    color: '#2D6A4F',
  },
  offlineText: {
    opacity: 0.8,
  },
});
