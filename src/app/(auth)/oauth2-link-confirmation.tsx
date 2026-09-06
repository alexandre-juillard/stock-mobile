import { useNetInfo } from '@react-native-community/netinfo';
import { useMutation } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Button, Snackbar, Text } from 'react-native-paper';

import { ScreenShell } from '@/components/ui/screen-shell';
import { useAuth } from '@/services/auth/auth-context';
import { resolveOAuth2LinkDecisionWithTokens } from '@/services/auth/auth-api';
import {
  enqueuePendingOAuth2LinkDecision,
  flushPendingOAuth2LinkDecision,
} from '@/services/offline/oauth2-link-decision-queue';
import type { LinkDecisionRequestDecision, LoginResponse } from '@/services/api/generated/model';
import { LinkDecisionRequestDecision as LinkDecision } from '@/services/api/generated/model';
import { mapErrorToUi } from '@/utils/error-mapper';

const STOCK_ROUTE = '/(tabs)/stock' as Href;

function toSingleParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }

  return value ?? '';
}

export default function OAuth2LinkConfirmationScreen() {
  const router = useRouter();
  const { setSession } = useAuth();
  const netInfo = useNetInfo();
  const params = useLocalSearchParams<{ linkContext?: string | string[] }>();
  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null);

  const linkContext = toSingleParam(params.linkContext);
  const hasLinkContext = linkContext.trim().length > 0;
  const isOffline = netInfo.isConnected === false || netInfo.isInternetReachable === false;

  const decisionMutation = useMutation({
    mutationFn: resolveOAuth2LinkDecisionWithTokens,
  });

  const applySessionAndRedirect = useCallback(
    async (tokens: LoginResponse) => {
      if (!tokens.accessToken || !tokens.refreshToken) {
        throw new Error('Jetons de session manquants');
      }

      await setSession({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      });

      router.replace(STOCK_ROUTE);
    },
    [router, setSession]
  );

  useEffect(() => {
    if (isOffline || decisionMutation.isPending) {
      return;
    }

    let isCancelled = false;

    async function flushPendingDecision() {
      const result = await flushPendingOAuth2LinkDecision(async (request) => {
        return resolveOAuth2LinkDecisionWithTokens(request);
      });

      if (isCancelled) {
        return;
      }

      if (result.status === 'synced' && result.tokens) {
        try {
          await applySessionAndRedirect(result.tokens);
        } catch (error) {
          setSnackbarMessage(mapErrorToUi(error).message);
        }
      }

      if (result.status === 'failed' && result.message) {
        setSnackbarMessage(result.message);
      }
    }

    flushPendingDecision();

    return () => {
      isCancelled = true;
    };
  }, [applySessionAndRedirect, decisionMutation.isPending, isOffline]);

  const submitDecision = async (decision: LinkDecisionRequestDecision) => {
    if (!hasLinkContext) {
      setSnackbarMessage('Contexte de liaison manquant. Recommence la connexion Google.');
      return;
    }

    const request = { linkContext, decision };

    if (isOffline) {
      await enqueuePendingOAuth2LinkDecision(request);
      setSnackbarMessage('Decision enregistree hors ligne. Synchronisation a la reprise.');
      return;
    }

    try {
      const tokens = await decisionMutation.mutateAsync(request);
      await applySessionAndRedirect(tokens);
    } catch (error) {
      setSnackbarMessage(mapErrorToUi(error).message);
    }
  };

  return (
    <ScreenShell title="Liaison de compte" subtitle="Un compte existe deja avec cet email.">
      <Text>Un compte local existe deja avec cet email. Veux-tu le lier avec Google ?</Text>

      {!hasLinkContext ? (
        <Text>Le contexte de liaison est absent ou expire. Recommence la connexion Google.</Text>
      ) : null}

      {isOffline ? (
        <Text>Tu es hors ligne. Ta decision sera synchronisee des que la connexion revient.</Text>
      ) : null}

      <Button
        mode="contained"
        onPress={() => submitDecision(LinkDecision.LINK)}
        loading={decisionMutation.isPending}
        disabled={decisionMutation.isPending || !hasLinkContext}>
        Lier mon compte
      </Button>

      <Button
        mode="outlined"
        onPress={() => submitDecision(LinkDecision.DECLINE)}
        loading={decisionMutation.isPending}
        disabled={decisionMutation.isPending || !hasLinkContext}>
        Garder des comptes separes
      </Button>

      <Snackbar visible={Boolean(snackbarMessage)} onDismiss={() => setSnackbarMessage(null)} duration={4000}>
        {snackbarMessage}
      </Snackbar>
    </ScreenShell>
  );
}

