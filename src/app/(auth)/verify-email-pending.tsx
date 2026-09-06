import { zodResolver } from '@hookform/resolvers/zod';
import { useNetInfo } from '@react-native-community/netinfo';
import { useMutation } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Button, HelperText, Snackbar, Text, TextInput } from 'react-native-paper';

import { ScreenShell } from '@/components/ui/screen-shell';
import { resendConfirmationEmail } from '@/services/auth/auth-api';
import {
  enqueuePendingResendConfirmation,
  flushPendingResendConfirmation,
} from '@/services/offline/resend-confirmation-queue';
import { mapErrorToUi } from '@/utils/error-mapper';
import {
  resendConfirmationSchema,
  type ResendConfirmationFormValues,
} from '@/utils/validation';

const COOLDOWN_SECONDS = 30;

function toStringParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }

  return value ?? '';
}

export default function VerifyEmailPendingScreen() {
  const params = useLocalSearchParams();
  const pendingParam = toStringParam(params.pending as string | string[] | undefined);
  const initialEmail = toStringParam(params.email as string | string[] | undefined);
  const isPendingSync = pendingParam === '1';

  const netInfo = useNetInfo();
  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);

  const { control, handleSubmit, formState } = useForm<ResendConfirmationFormValues>({
    resolver: zodResolver(resendConfirmationSchema),
    defaultValues: {
      email: initialEmail,
    },
  });

  const resendMutation = useMutation({
    mutationFn: resendConfirmationEmail,
  });

  const isOffline = netInfo.isConnected === false || netInfo.isInternetReachable === false;
  const resendLabel = useMemo(() => {
    if (cooldownRemaining <= 0) {
      return 'Renvoyer l email';
    }

    return `Renvoyer dans ${cooldownRemaining}s`;
  }, [cooldownRemaining]);

  useEffect(() => {
    if (cooldownRemaining <= 0) {
      return;
    }

    const timerId = setInterval(() => {
      setCooldownRemaining((value) => (value > 0 ? value - 1 : 0));
    }, 1000);

    return () => {
      clearInterval(timerId);
    };
  }, [cooldownRemaining]);

  useEffect(() => {
    if (isOffline || resendMutation.isPending) {
      return;
    }

    let isCancelled = false;

    async function flushPendingResend() {
      const result = await flushPendingResendConfirmation(async (request) => {
        await resendConfirmationEmail(request);
      });

      if (isCancelled) {
        return;
      }

      if (result.status === 'synced') {
        setCooldownRemaining(COOLDOWN_SECONDS);
        setSnackbarMessage('Email de confirmation renvoye');
      }

      if (result.status === 'failed' && result.message) {
        setSnackbarMessage(result.message);
      }
    }

    flushPendingResend();

    return () => {
      isCancelled = true;
    };
  }, [isOffline, resendMutation.isPending]);

  const onResend = handleSubmit(async (values) => {
    if (cooldownRemaining > 0) {
      return;
    }

    if (isOffline) {
      await enqueuePendingResendConfirmation(values);
      setCooldownRemaining(COOLDOWN_SECONDS);
      setSnackbarMessage('Renvoi en attente de connexion');
      return;
    }

    try {
      await resendMutation.mutateAsync(values);
      setCooldownRemaining(COOLDOWN_SECONDS);
      setSnackbarMessage('Email de confirmation renvoye');
    } catch (error) {
      setSnackbarMessage(mapErrorToUi(error).message);
    }
  });

  return (
    <ScreenShell title="Verification email" subtitle="Ton compte est presque pret.">
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

      {isPendingSync ? (
        <Text>
          Inscription en attente de synchronisation. Des que la connexion revient, le compte sera cree
          automatiquement.
        </Text>
      ) : (
        <Text>Verifie ta boite mail puis confirme ton compte.</Text>
      )}

      {isOffline ? <Text>Tu es hors ligne. Le renvoi sera synchronise automatiquement.</Text> : null}

      <Button
        mode="contained"
        onPress={onResend}
        loading={resendMutation.isPending}
        disabled={cooldownRemaining > 0 || resendMutation.isPending}>
        {resendLabel}
      </Button>

      <Snackbar visible={Boolean(snackbarMessage)} onDismiss={() => setSnackbarMessage(null)} duration={4000}>
        {snackbarMessage}
      </Snackbar>
    </ScreenShell>
  );
}

