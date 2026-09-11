import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNetInfo } from '@react-native-community/netinfo';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Card, HelperText, Snackbar, Switch, Text, TextInput } from 'react-native-paper';

import { ScreenShell } from '@/components/ui/screen-shell';
import { registerToken, unregisterToken } from '@/services/api/generated/notifications-push/notifications-push';
import {
  updateSettings,
  useGetProfile,
} from '@/services/api/generated/profil-utilisateur/profil-utilisateur';
import type { RegisterPushTokenRequestPlatform } from '@/services/api/generated/model';
import { ApiClientError } from '@/services/api/http-client';
import { invalidateProfileQueries } from '@/services/api/query-invalidations';
import {
  enqueuePendingNotificationSettingsMutation,
  flushPendingNotificationSettingsMutations,
  getLatestPendingExpirationAlertDays,
  getPendingNotificationSettingsMutationsCount,
} from '@/services/offline/notification-settings-queue';
import {
  enqueuePendingPushTokenAction,
  flushPendingPushTokenActions,
  getPendingPushTokenActionsCount,
  type EnqueuePendingPushTokenActionInput,
} from '@/services/offline/push-token-queue';
import { mapErrorToUi } from '@/utils/error-mapper';
import { notificationSettingsSchema } from '@/utils/validation';

const PUSH_ENABLED_STORAGE_KEY = 'notifications.push.enabled.v1';
const PUSH_TOKEN_STORAGE_KEY = 'notifications.push.token.v1';

interface StoredPushPreference {
  isEnabled: boolean;
  token: string | null;
}

function shouldQueueAfterError(error: unknown): boolean {
  return !(error instanceof ApiClientError && error.status >= 400 && error.status < 500);
}

function resolvePushPlatform(): RegisterPushTokenRequestPlatform | null {
  if (Platform.OS === 'android') {
    return 'ANDROID';
  }

  if (Platform.OS === 'ios') {
    return 'IOS';
  }

  return null;
}

async function readStoredPushPreference(): Promise<StoredPushPreference> {
  const [storedEnabled, storedToken] = await Promise.all([
    AsyncStorage.getItem(PUSH_ENABLED_STORAGE_KEY),
    AsyncStorage.getItem(PUSH_TOKEN_STORAGE_KEY),
  ]);

  const token = storedToken?.trim() ? storedToken.trim() : null;

  if (storedEnabled === '1') {
    return {
      isEnabled: true,
      token,
    };
  }

  if (storedEnabled === '0') {
    return {
      isEnabled: false,
      token,
    };
  }

  return {
    isEnabled: Boolean(token),
    token,
  };
}

async function writeStoredPushPreference(isEnabled: boolean, token: string | null): Promise<void> {
  await AsyncStorage.setItem(PUSH_ENABLED_STORAGE_KEY, isEnabled ? '1' : '0');

  const normalizedToken = token?.trim() ? token.trim() : null;
  if (normalizedToken) {
    await AsyncStorage.setItem(PUSH_TOKEN_STORAGE_KEY, normalizedToken);
    return;
  }

  await AsyncStorage.removeItem(PUSH_TOKEN_STORAGE_KEY);
}

async function requestDevicePushToken(): Promise<string> {
  const currentPermissions = await Notifications.getPermissionsAsync();
  let finalStatus = currentPermissions.status;

  if (finalStatus !== 'granted') {
    const requestedPermissions = await Notifications.requestPermissionsAsync();
    finalStatus = requestedPermissions.status;
  }

  if (finalStatus !== 'granted') {
    throw new Error('Autorise les notifications pour activer les alertes push.');
  }

  const devicePushToken = await Notifications.getDevicePushTokenAsync();
  const rawToken = devicePushToken.data;

  const normalizedToken =
    typeof rawToken === 'string' ? rawToken.trim() : JSON.stringify(rawToken).trim();

  if (!normalizedToken) {
    throw new Error('Impossible de recuperer un token push pour cet appareil.');
  }

  return normalizedToken;
}

export default function NotificationSettingsScreen() {
  const queryClient = useQueryClient();
  const netInfo = useNetInfo();

  const isOffline = netInfo.isConnected === false || netInfo.isInternetReachable === false;
  const isNativePushPlatform = Platform.OS === 'android' || Platform.OS === 'ios';

  const profileQuery = useGetProfile();
  const profile = profileQuery.data?.data;

  const {
    data: pendingSettingsMutationsCount = 0,
    refetch: refreshPendingSettingsMutationsCount,
  } = useQuery({
    queryKey: ['offline-notification-settings-mutations-count'],
    queryFn: getPendingNotificationSettingsMutationsCount,
  });

  const {
    data: pendingPushTokenActionsCount = 0,
    refetch: refreshPendingPushTokenActionsCount,
  } = useQuery({
    queryKey: ['offline-push-token-actions-count'],
    queryFn: getPendingPushTokenActionsCount,
  });

  const [expirationAlertDaysDraft, setExpirationAlertDaysDraft] = useState<string | null>(null);
  const [expirationAlertDaysError, setExpirationAlertDaysError] = useState<string | null>(null);
  const [isPushEnabled, setIsPushEnabled] = useState(false);
  const [registeredPushToken, setRegisteredPushToken] = useState<string | null>(null);
  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null);

  const [isHydratingPushPreference, setIsHydratingPushPreference] = useState(true);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isUpdatingPush, setIsUpdatingPush] = useState(false);
  const [isSyncingQueue, setIsSyncingQueue] = useState(false);

  const hasAutoSyncedCurrentOnlineSessionRef = useRef(false);

  const expirationAlertDaysValue = useMemo(() => {
    if (expirationAlertDaysDraft !== null) {
      return expirationAlertDaysDraft;
    }

    if (typeof profile?.expirationAlertDays === 'number' && profile.expirationAlertDays >= 1) {
      return String(profile.expirationAlertDays);
    }

    return '';
  }, [expirationAlertDaysDraft, profile?.expirationAlertDays]);

  const hasPendingActions = pendingSettingsMutationsCount > 0 || pendingPushTokenActionsCount > 0;
  const isBusy = isSavingSettings || isUpdatingPush || isSyncingQueue;
  const isRefreshing = profileQuery.isFetching || isSyncingQueue;

  useEffect(() => {
    let isCancelled = false;

    async function hydratePendingSettingsValue() {
      try {
        const latestPendingValue = await getLatestPendingExpirationAlertDays();
        if (!isCancelled && typeof latestPendingValue === 'number') {
          setExpirationAlertDaysDraft(String(latestPendingValue));
        }
      } catch {
        // Best effort only.
      }
    }

    void hydratePendingSettingsValue();

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    let isCancelled = false;

    async function hydratePushPreference() {
      try {
        const storedPreference = await readStoredPushPreference();
        if (isCancelled) {
          return;
        }

        setIsPushEnabled(storedPreference.isEnabled);
        setRegisteredPushToken(storedPreference.token);
      } finally {
        if (!isCancelled) {
          setIsHydratingPushPreference(false);
        }
      }
    }

    void hydratePushPreference();

    return () => {
      isCancelled = true;
    };
  }, []);

  const persistPushEnabledState = useCallback(async (token: string, message: string) => {
    setIsPushEnabled(true);
    setRegisteredPushToken(token);
    await writeStoredPushPreference(true, token);
    setSnackbarMessage(message);
  }, []);

  const persistPushDisabledState = useCallback(async (message: string) => {
    setIsPushEnabled(false);
    setRegisteredPushToken(null);
    await writeStoredPushPreference(false, null);
    setSnackbarMessage(message);
  }, []);

  const enqueuePushAction = useCallback(
    async (input: EnqueuePendingPushTokenActionInput, message: string) => {
      await enqueuePendingPushTokenAction(input);
      await refreshPendingPushTokenActionsCount();
      setSnackbarMessage(message);
    },
    [refreshPendingPushTokenActionsCount]
  );

  const handleRefresh = useCallback(async () => {
    await Promise.all([
      profileQuery.refetch(),
      refreshPendingSettingsMutationsCount(),
      refreshPendingPushTokenActionsCount(),
    ]);
  }, [profileQuery, refreshPendingPushTokenActionsCount, refreshPendingSettingsMutationsCount]);

  const handleSyncQueues = useCallback(async () => {
    if (isOffline || isBusy) {
      return;
    }

    setIsSyncingQueue(true);

    try {
      const settingsResult = await flushPendingNotificationSettingsMutations({
        updateSettings: async (payload) => {
          await updateSettings(payload);
        },
      });

      const pushResult = await flushPendingPushTokenActions({
        registerToken: async (payload) => {
          await registerToken(payload);
        },
        unregisterToken: async (payload) => {
          try {
            await unregisterToken(payload.token);
          } catch (error) {
            if (error instanceof ApiClientError && error.status === 404) {
              return;
            }

            throw error;
          }
        },
      });

      await Promise.all([refreshPendingSettingsMutationsCount(), refreshPendingPushTokenActionsCount()]);

      if (settingsResult.syncedCount > 0 || settingsResult.failedCount > 0) {
        await invalidateProfileQueries(queryClient);
      }

      const syncMessages: string[] = [];

      if (settingsResult.status === 'retry_later' && settingsResult.retryCount > 0) {
        syncMessages.push(
          `${settingsResult.syncedCount} reglage(s) synchronise(s), ${settingsResult.retryCount} encore en attente.`
        );
      } else if (settingsResult.status === 'failed' && settingsResult.failedCount > 0) {
        syncMessages.push(`${settingsResult.failedCount} reglage(s) notifications ont echoue.`);
      } else if (settingsResult.status === 'synced' && settingsResult.syncedCount > 0) {
        syncMessages.push(`${settingsResult.syncedCount} reglage(s) notifications synchronise(s).`);
      }

      if (pushResult.status === 'retry_later' && pushResult.retryCount > 0) {
        syncMessages.push(
          `${pushResult.syncedCount} action(s) push synchronisee(s), ${pushResult.retryCount} encore en attente.`
        );
      } else if (pushResult.status === 'failed' && pushResult.failedCount > 0) {
        syncMessages.push(`${pushResult.failedCount} action(s) push ont echoue.`);
      } else if (pushResult.status === 'synced' && pushResult.syncedCount > 0) {
        syncMessages.push(`${pushResult.syncedCount} action(s) push synchronisee(s).`);
      }

      if (syncMessages.length > 0) {
        setSnackbarMessage(syncMessages.join(' '));
      }
    } finally {
      setIsSyncingQueue(false);
    }
  }, [
    isBusy,
    isOffline,
    queryClient,
    refreshPendingPushTokenActionsCount,
    refreshPendingSettingsMutationsCount,
  ]);

  useEffect(() => {
    if (isOffline) {
      hasAutoSyncedCurrentOnlineSessionRef.current = false;
      return;
    }

    if (
      hasAutoSyncedCurrentOnlineSessionRef.current ||
      isSyncingQueue ||
      (pendingSettingsMutationsCount === 0 && pendingPushTokenActionsCount === 0)
    ) {
      return;
    }

    hasAutoSyncedCurrentOnlineSessionRef.current = true;
    void handleSyncQueues();
  }, [
    handleSyncQueues,
    isOffline,
    isSyncingQueue,
    pendingPushTokenActionsCount,
    pendingSettingsMutationsCount,
  ]);

  const handleSaveExpirationAlertDays = useCallback(async () => {
    const parsedSettings = notificationSettingsSchema.safeParse({
      expirationAlertDays: expirationAlertDaysValue,
    });

    if (!parsedSettings.success) {
      setExpirationAlertDaysError(parsedSettings.error.issues[0]?.message ?? 'Valeur invalide');
      return;
    }

    const payload = {
      expirationAlertDays: parsedSettings.data.expirationAlertDays,
    };

    setExpirationAlertDaysDraft(String(payload.expirationAlertDays));
    setExpirationAlertDaysError(null);

    if (isOffline) {
      await enqueuePendingNotificationSettingsMutation(payload);
      await refreshPendingSettingsMutationsCount();
      setSnackbarMessage('Delai d alerte enregistre hors ligne.');
      return;
    }

    setIsSavingSettings(true);

    try {
      await updateSettings(payload);
      await invalidateProfileQueries(queryClient);
      setSnackbarMessage('Delai d alerte mis a jour.');
    } catch (error) {
      if (shouldQueueAfterError(error)) {
        await enqueuePendingNotificationSettingsMutation(payload);
        await refreshPendingSettingsMutationsCount();
        setSnackbarMessage('Reseau instable: reglage place en file hors ligne.');
        return;
      }

      const uiError = mapErrorToUi(error);
      setExpirationAlertDaysError(uiError.fieldErrors.expirationAlertDays);
      setSnackbarMessage(uiError.message);
    } finally {
      setIsSavingSettings(false);
    }
  }, [
    expirationAlertDaysValue,
    isOffline,
    queryClient,
    refreshPendingSettingsMutationsCount,
  ]);

  const handleEnablePush = useCallback(async () => {
    if (!isNativePushPlatform) {
      setSnackbarMessage('Les notifications push ne sont pas disponibles sur cette plateforme.');
      return;
    }

    const platform = resolvePushPlatform();
    if (!platform) {
      setSnackbarMessage('Plateforme push non supportee.');
      return;
    }

    const token = await requestDevicePushToken();

    const actionInput: EnqueuePendingPushTokenActionInput = {
      type: 'register_token',
      payload: {
        token,
        platform,
      },
    };

    if (isOffline) {
      await enqueuePushAction(actionInput, 'Activation push enregistree hors ligne.');
      await persistPushEnabledState(token, 'Activation push enregistree hors ligne.');
      return;
    }

    try {
      await registerToken(actionInput.payload);
      await persistPushEnabledState(token, 'Notifications push activees.');
    } catch (error) {
      if (shouldQueueAfterError(error)) {
        await enqueuePushAction(actionInput, 'Reseau instable: activation push placee en file hors ligne.');
        await persistPushEnabledState(token, 'Reseau instable: activation push placee en file hors ligne.');
        return;
      }

      setSnackbarMessage(mapErrorToUi(error).message);
    }
  }, [enqueuePushAction, isNativePushPlatform, isOffline, persistPushEnabledState]);

  const handleDisablePush = useCallback(async () => {
    const currentToken = registeredPushToken?.trim() ?? '';

    if (!currentToken) {
      await persistPushDisabledState('Notifications push desactivees.');
      return;
    }

    const actionInput: EnqueuePendingPushTokenActionInput = {
      type: 'unregister_token',
      payload: {
        token: currentToken,
      },
    };

    if (isOffline) {
      await enqueuePushAction(actionInput, 'Desactivation push enregistree hors ligne.');
      await persistPushDisabledState('Desactivation push enregistree hors ligne.');
      return;
    }

    try {
      await unregisterToken(currentToken);
      await persistPushDisabledState('Notifications push desactivees.');
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 404) {
        await persistPushDisabledState('Notifications push deja desactivees sur le serveur.');
        return;
      }

      if (shouldQueueAfterError(error)) {
        await enqueuePushAction(actionInput, 'Reseau instable: desactivation push placee en file hors ligne.');
        await persistPushDisabledState('Reseau instable: desactivation push placee en file hors ligne.');
        return;
      }

      setSnackbarMessage(mapErrorToUi(error).message);
    }
  }, [enqueuePushAction, isOffline, persistPushDisabledState, registeredPushToken]);

  const handleTogglePush = useCallback(
    async (nextValue: boolean) => {
      if (isBusy || isHydratingPushPreference) {
        return;
      }

      setIsUpdatingPush(true);

      try {
        if (nextValue) {
          await handleEnablePush();
          return;
        }

        await handleDisablePush();
      } catch (error) {
        setSnackbarMessage(mapErrorToUi(error).message);
      } finally {
        setIsUpdatingPush(false);
      }
    },
    [handleDisablePush, handleEnablePush, isBusy, isHydratingPushPreference]
  );

  return (
    <ScreenShell title="Notifications" subtitle="Regle les alertes d expiration et l opt-in push.">
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => void handleRefresh()} />}>
        {isOffline ? (
          <Text style={styles.offlineText}>Tu es hors ligne: les preferences seront synchronisees plus tard.</Text>
        ) : null}

        {hasPendingActions ? (
          <Card mode="outlined" style={styles.pendingCard}>
            <Card.Content style={styles.pendingCardContent}>
              {pendingSettingsMutationsCount > 0 ? (
                <Text>{pendingSettingsMutationsCount} reglage(s) notifications en attente.</Text>
              ) : null}
              {pendingPushTokenActionsCount > 0 ? (
                <Text>{pendingPushTokenActionsCount} action(s) push en attente.</Text>
              ) : null}

              {!isOffline ? (
                <Button
                  mode="outlined"
                  icon="sync"
                  onPress={() => void handleSyncQueues()}
                  loading={isSyncingQueue}
                  disabled={isBusy}>
                  Synchroniser
                </Button>
              ) : null}
            </Card.Content>
          </Card>
        ) : null}

        {profileQuery.isError ? (
          <Card mode="outlined">
            <Card.Content style={styles.errorCardContent}>
              <Text style={styles.errorText}>{mapErrorToUi(profileQuery.error).message}</Text>
              <Button mode="outlined" onPress={() => void handleRefresh()} disabled={isBusy}>
                Reessayer
              </Button>
            </Card.Content>
          </Card>
        ) : null}

        <Card mode="outlined">
          <Card.Content style={styles.sectionContent}>
            <Text variant="titleMedium">Alerte expiration</Text>
            <Text style={styles.supportingText}>
              Nombre de jours avant la date d expiration pour afficher une alerte.
            </Text>

            <TextInput
              mode="outlined"
              label="Delai (jours)"
              keyboardType="number-pad"
              value={expirationAlertDaysValue}
              onChangeText={(value) => {
                setExpirationAlertDaysDraft(value);
                setExpirationAlertDaysError(null);
              }}
              error={Boolean(expirationAlertDaysError)}
              disabled={isBusy}
            />
            <HelperText type="error" visible={Boolean(expirationAlertDaysError)}>
              {expirationAlertDaysError}
            </HelperText>

            <Button
              mode="contained-tonal"
              onPress={() => void handleSaveExpirationAlertDays()}
              loading={isSavingSettings}
              disabled={isBusy}>
              Enregistrer le delai
            </Button>
          </Card.Content>
        </Card>

        <Card mode="outlined">
          <Card.Content style={styles.sectionContent}>
            <Text variant="titleMedium">Notifications push</Text>
            <View style={styles.pushRow}>
              <View style={styles.pushTextBlock}>
                <Text>{isPushEnabled ? 'Activees' : 'Desactivees'}</Text>
                <Text style={styles.supportingText}>
                  {isPushEnabled
                    ? 'Ton appareil recevra les alertes d expiration.'
                    : 'Active les notifications pour etre alerte avant expiration.'}
                </Text>
              </View>

              <Switch
                value={isPushEnabled}
                onValueChange={(nextValue) => void handleTogglePush(nextValue)}
                disabled={isBusy || isHydratingPushPreference || !isNativePushPlatform}
              />
            </View>

            <Text style={styles.supportingText}>
              {registeredPushToken ? 'Token appareil enregistre.' : 'Aucun token appareil enregistre.'}
            </Text>
            {!isNativePushPlatform ? (
              <Text style={styles.supportingText}>Les push ne sont pas disponibles sur cette plateforme.</Text>
            ) : null}
          </Card.Content>
        </Card>
      </ScrollView>

      <Snackbar visible={Boolean(snackbarMessage)} onDismiss={() => setSnackbarMessage(null)} duration={4500}>
        {snackbarMessage}
      </Snackbar>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    gap: 12,
    paddingBottom: 32,
  },
  offlineText: {
    opacity: 0.85,
  },
  pendingCard: {
    elevation: 0,
  },
  pendingCardContent: {
    gap: 8,
  },
  errorCardContent: {
    gap: 8,
  },
  errorText: {
    color: '#D90429',
  },
  sectionContent: {
    gap: 10,
  },
  supportingText: {
    opacity: 0.82,
  },
  pushRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  pushTextBlock: {
    flex: 1,
    gap: 4,
  },
});

