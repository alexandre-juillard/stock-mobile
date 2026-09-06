import { zodResolver } from '@hookform/resolvers/zod';
import { useNetInfo } from '@react-native-community/netinfo';
import { useMutation } from '@tanstack/react-query';
import { Link, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';
import { Button, HelperText, Snackbar, Text, TextInput } from 'react-native-paper';

import { ScreenShell } from '@/components/ui/screen-shell';
import { resetPasswordWithToken } from '@/services/auth/auth-api';
import { mapErrorToUi } from '@/utils/error-mapper';
import { resetPasswordSchema, type ResetPasswordFormValues } from '@/utils/validation';

const LOGIN_ROUTE = '/(auth)/login' as Href;

export default function ResetPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const netInfo = useNetInfo();
  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null);

  const token = Array.isArray(params.token) ? (params.token[0] ?? '') : (params.token ?? '');
  const hasValidToken = token.trim().length > 0;
  const isOffline = netInfo.isConnected === false || netInfo.isInternetReachable === false;

  const { control, handleSubmit, formState } = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      newPassword: '',
      confirmPassword: '',
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: resetPasswordWithToken,
  });

  const onSubmit = handleSubmit(async (values) => {
    if (!hasValidToken) {
      setSnackbarMessage('Lien de reinitialisation invalide ou incomplet');
      return;
    }

    if (isOffline) {
      setSnackbarMessage('Impossible hors ligne: reconnecte-toi pour valider le nouveau mot de passe');
      return;
    }

    try {
      await resetPasswordMutation.mutateAsync({
        token,
        newPassword: values.newPassword,
      });

      router.replace({
        pathname: LOGIN_ROUTE,
        params: {
          notice: 'password-reset-success',
        },
      } as Href);
    } catch (error) {
      setSnackbarMessage(mapErrorToUi(error).message);
    }
  });

  return (
    <ScreenShell title="Nouveau mot de passe" subtitle="Choisis un mot de passe securise pour ton compte.">
      {!hasValidToken ? (
        <Text>Le token de reinitialisation est manquant. Ouvre le lien depuis ton email.</Text>
      ) : null}

      {isOffline ? (
        <Text style={styles.offlineText}>
          Tu es hors ligne. Cette etape doit etre effectuee en ligne car le token expire rapidement.
        </Text>
      ) : null}

      <Controller
        control={control}
        name="newPassword"
        render={({ field: { value, onBlur, onChange } }) => (
          <TextInput
            mode="outlined"
            label="Nouveau mot de passe"
            secureTextEntry
            autoCapitalize="none"
            autoComplete="password"
            value={value}
            onBlur={onBlur}
            onChangeText={onChange}
            error={Boolean(formState.errors.newPassword)}
          />
        )}
      />
      <HelperText type="error" visible={Boolean(formState.errors.newPassword)}>
        {formState.errors.newPassword?.message}
      </HelperText>

      <Controller
        control={control}
        name="confirmPassword"
        render={({ field: { value, onBlur, onChange } }) => (
          <TextInput
            mode="outlined"
            label="Confirmer le mot de passe"
            secureTextEntry
            autoCapitalize="none"
            autoComplete="password"
            value={value}
            onBlur={onBlur}
            onChangeText={onChange}
            error={Boolean(formState.errors.confirmPassword)}
          />
        )}
      />
      <HelperText type="error" visible={Boolean(formState.errors.confirmPassword)}>
        {formState.errors.confirmPassword?.message}
      </HelperText>

      <Button
        mode="contained"
        onPress={onSubmit}
        loading={resetPasswordMutation.isPending}
        disabled={resetPasswordMutation.isPending || !hasValidToken}>
        Valider
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

