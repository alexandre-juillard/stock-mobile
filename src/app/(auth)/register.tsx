import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { Link, useRouter, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';
import { Button, HelperText, Snackbar, Text } from 'react-native-paper';

import { FormTextField } from '@/components/ui/form-text-field';
import { PasswordTextField } from '@/components/ui/password-text-field';
import { ScreenShell } from '@/components/ui/screen-shell';
import { LOGIN_ROUTE, VERIFY_EMAIL_ROUTE } from '@/constants/routes';
import { useIsOffline } from '@/hooks/use-is-offline';
import { registerWithEmail } from '@/services/auth/auth-api';
import { enqueuePendingRegister, flushPendingRegister } from '@/services/offline/register-queue';
import { mapErrorToUi } from '@/utils/error-mapper';
import { registerSchema, type RegisterFormValues } from '@/utils/validation';

export default function RegisterScreen() {
  const router = useRouter();
  const isOffline = useIsOffline();
  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null);

  const { control, handleSubmit, formState } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      password: '',
    },
  });

  const registerMutation = useMutation({
    mutationFn: registerWithEmail,
  });

  useEffect(() => {
    if (isOffline || registerMutation.isPending) {
      return;
    }

    let isCancelled = false;

    async function syncPendingRegistration() {
      const result = await flushPendingRegister(async (pendingRequest) => {
        await registerWithEmail(pendingRequest);
      });

      if (isCancelled) {
        return;
      }

      if (result.status === 'synced' && result.email) {
        setSnackbarMessage('Inscription synchronisee');
        router.replace({
          pathname: VERIFY_EMAIL_ROUTE,
          params: {
            email: result.email,
          },
        } as Href);
      }

      if (result.status === 'failed' && result.message) {
        setSnackbarMessage(result.message);
      }
    }

    syncPendingRegistration();

    return () => {
      isCancelled = true;
    };
  }, [isOffline, registerMutation.isPending, router]);

  const handleRegister = handleSubmit(async (values) => {
    if (isOffline) {
      await enqueuePendingRegister(values);
      setSnackbarMessage('Inscription en attente de connexion');
      router.replace({
        pathname: VERIFY_EMAIL_ROUTE,
        params: {
          email: values.email,
          pending: '1',
        },
      } as Href);
      return;
    }

    try {
      await registerMutation.mutateAsync(values);
      router.replace({
        pathname: VERIFY_EMAIL_ROUTE,
        params: {
          email: values.email,
        },
      } as Href);
    } catch (error) {
      setSnackbarMessage(mapErrorToUi(error).message);
    }
  });

  return (
    <ScreenShell title="Inscription" subtitle="Cree ton compte PantryFlow.">
      <Controller
        control={control}
        name="firstName"
        render={({ field: { onChange, onBlur, value } }) => (
          <FormTextField
            label="Prenom"
            value={value}
            onBlur={onBlur}
            onChangeText={onChange}
            error={Boolean(formState.errors.firstName)}
          />
        )}
      />
      <HelperText type="error" visible={Boolean(formState.errors.firstName)}>
        {formState.errors.firstName?.message}
      </HelperText>

      <Controller
        control={control}
        name="lastName"
        render={({ field: { onChange, onBlur, value } }) => (
          <FormTextField
            label="Nom"
            value={value}
            onBlur={onBlur}
            onChangeText={onChange}
            error={Boolean(formState.errors.lastName)}
          />
        )}
      />
      <HelperText type="error" visible={Boolean(formState.errors.lastName)}>
        {formState.errors.lastName?.message}
      </HelperText>

      <Controller
        control={control}
        name="email"
        render={({ field: { onChange, onBlur, value } }) => (
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
        render={({ field: { onChange, onBlur, value } }) => (
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

      <Button mode="contained" onPress={() => void handleRegister()} loading={registerMutation.isPending}>
        Creer le compte
      </Button>

      {isOffline ? (
        <Text style={styles.offlineText}>
          Tu es hors ligne. Si tu valides, ton inscription sera synchronisee automatiquement.
        </Text>
      ) : null}

      <View style={styles.links}>
        <Link href={LOGIN_ROUTE} style={styles.link}>
          J&apos;ai deja un compte
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
