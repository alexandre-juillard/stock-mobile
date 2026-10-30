import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { Link, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';
import { Button, HelperText, Snackbar, Text } from 'react-native-paper';

import { PasswordTextField } from '@/components/ui/password-text-field';
import { ScreenShell } from '@/components/ui/screen-shell';
import { LOGIN_ROUTE } from '@/constants/routes';
import { useIsOffline } from '@/hooks/use-is-offline';
import { resetPasswordWithToken } from '@/services/auth/auth-api';
import { mapErrorToUi } from '@/utils/error-mapper';
import { getFirstRouteParam } from '@/utils/route-params';
import { resetPasswordSchema, type ResetPasswordFormValues } from '@/utils/validation';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const isOffline = useIsOffline();
  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null);

  const token = getFirstRouteParam(params.token) ?? '';
  const hasValidToken = token.trim().length > 0;

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
          <PasswordTextField
            label="Nouveau mot de passe"
            autoCapitalize="none"
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
          <PasswordTextField
            label="Confirmer le mot de passe"
            autoCapitalize="none"
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
        onPress={() => void onSubmit()}
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
    alignItems: 'center',
  },
  link: {
    color: '#2D6A4F',
  },
  offlineText: {
    opacity: 0.8,
  },
});
