import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { Link, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';
import { useNetInfo } from '@react-native-community/netinfo';
import { Button, Checkbox, HelperText, Snackbar, Text, TextInput } from 'react-native-paper';

import { ScreenShell } from '@/components/ui/screen-shell';
import { useAuth } from '@/services/auth/auth-context';
import { loginWithGoogle, loginWithPassword } from '@/services/auth/auth-api';
import { mapErrorToUi } from '@/utils/error-mapper';
import { loginSchema, type LoginFormValues } from '@/utils/validation';

const REGISTER_ROUTE = '/(auth)/register' as Href;
const FORGOT_PASSWORD_ROUTE = '/(auth)/forgot-password' as Href;
const STOCK_ROUTE = '/(tabs)/stock' as Href;
const OAUTH_LINK_ROUTE = '/(auth)/oauth2-link-confirmation' as Href;

export default function LoginScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ notice?: string | string[] }>();
  const { setSession } = useAuth();
  const netInfo = useNetInfo();

  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null);
  const [isRouteNoticeDismissed, setRouteNoticeDismissed] = useState(false);

  const routeNotice =
    (Array.isArray(params.notice) ? params.notice[0] : params.notice) === 'reset-link-sent'
      ? 'Lien de reinitialisation envoye. Verifie ta boite mail.'
      : null;

  const displayedSnackbarMessage =
    snackbarMessage ?? (!isRouteNoticeDismissed ? routeNotice : null);

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

  const isOffline = netInfo.isConnected === false || netInfo.isInternetReachable === false;
  const isSubmitting = loginMutation.isPending || googleMutation.isPending;

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
          <TextInput
            mode="outlined"
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
          <TextInput
            mode="outlined"
            label="Mot de passe"
            secureTextEntry
            autoCapitalize="none"
            autoComplete="password"
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
            <Text>Se souvenir de moi</Text>
          </View>
        )}
      />

      <Button mode="contained" onPress={handleLogin} loading={loginMutation.isPending} disabled={isSubmitting}>
        Se connecter
      </Button>

      <Button
        mode="outlined"
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

          setRouteNoticeDismissed(true);
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
  },
  link: {
    color: '#2D6A4F',
  },
  offlineText: {
    opacity: 0.8,
  },
});

