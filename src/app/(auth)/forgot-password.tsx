import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { Link, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';
import { Button, HelperText, Snackbar, Text } from 'react-native-paper';

import { FormTextField } from '@/components/ui/form-text-field';
import { ScreenShell } from '@/components/ui/screen-shell';
import { LOGIN_ROUTE } from '@/constants/routes';
import { useIsOffline } from '@/hooks/use-is-offline';
import { forgotPasswordWithEmail } from '@/services/auth/auth-api';
import {
  enqueuePendingForgotPassword,
  flushPendingForgotPassword,
} from '@/services/offline/forgot-password-queue';
import { mapErrorToUi } from '@/utils/error-mapper';
import { getFirstRouteParam } from '@/utils/route-params';
import { forgotPasswordSchema, type ForgotPasswordFormValues } from '@/utils/validation';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string | string[] }>();
  const isOffline = useIsOffline();

  const initialEmail = getFirstRouteParam(params.email) ?? '';
  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null);

  const { control, handleSubmit, formState } = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: initialEmail,
    },
  });

  const forgotPasswordMutation = useMutation({
    mutationFn: forgotPasswordWithEmail,
  });

  useEffect(() => {
    if (isOffline || forgotPasswordMutation.isPending) {
      return;
    }

    let isCancelled = false;

    async function flushPendingResetRequest() {
      const result = await flushPendingForgotPassword(async (request) => {
        await forgotPasswordWithEmail(request);
      });

      if (isCancelled) {
        return;
      }

      if (result.status === 'synced') {
        router.replace({
          pathname: LOGIN_ROUTE,
          params: {
            notice: 'reset-link-sent',
          },
        } as Href);
      }

      if (result.status === 'failed' && result.message) {
        setSnackbarMessage(result.message);
      }
    }

    flushPendingResetRequest();

    return () => {
      isCancelled = true;
    };
  }, [forgotPasswordMutation.isPending, isOffline, router]);

  const onSubmit = handleSubmit(async (values) => {
    if (isOffline) {
      await enqueuePendingForgotPassword(values);
      setSnackbarMessage('Demande en attente de connexion');
      return;
    }

    try {
      await forgotPasswordMutation.mutateAsync(values);
      router.replace({
        pathname: LOGIN_ROUTE,
        params: {
          notice: 'reset-link-sent',
        },
      } as Href);
    } catch (error) {
      setSnackbarMessage(mapErrorToUi(error).message);
    }
  });

  return (
    <ScreenShell title="Mot de passe oublie" subtitle="On t envoie un lien pour choisir un nouveau mot de passe.">
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

      {isOffline ? (
        <Text style={styles.offlineText}>
          Tu es hors ligne. La demande sera envoyee automatiquement quand la connexion revient.
        </Text>
      ) : null}

      <Button mode="contained" onPress={() => void onSubmit()} loading={forgotPasswordMutation.isPending}>
        Envoyer le lien
      </Button>

      <View style={styles.links}>
        <Link href={LOGIN_ROUTE} style={styles.link}>
          Retour a la connexion
        </Link>
      </View>

      <Snackbar visible={Boolean(snackbarMessage)} onDismiss={() => setSnackbarMessage(null)} duration={4000}>
        {snackbarMessage}
      </Snackbar>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  links: {
    marginTop: 8,
  },
  link: {
    color: '#2D6A4F',
  },
  offlineText: {
    opacity: 0.8,
  },
});
