import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNetInfo } from '@react-native-community/netinfo';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Card, Chip, HelperText, Snackbar, Text, TextInput } from 'react-native-paper';

import { ScreenShell } from '@/components/ui/screen-shell';
import { logout as revokeRefreshToken } from '@/services/api/generated/authentification/authentification';
import {
  deleteAvatar,
  updateLocale,
  updateProfile,
  updateSettings,
  uploadAvatar,
  useGetProfile,
} from '@/services/api/generated/profil-utilisateur/profil-utilisateur';
import { ApiClientError } from '@/services/api/http-client';
import { invalidateProfileQueries } from '@/services/api/query-invalidations';
import { useAuth } from '@/services/auth/auth-context';
import {
  enqueuePendingLogoutRevoke,
  flushPendingLogoutRevokes,
  getPendingLogoutRevokesCount,
} from '@/services/offline/logout-revoke-queue';
import {
  clearPendingProfileMutations,
  enqueuePendingProfileMutation,
  flushPendingProfileMutations,
  getPendingProfileMutationsCount,
  type EnqueuePendingProfileMutationInput,
  type PendingAvatarSelection,
  type ProfileTheme,
} from '@/services/offline/profile-mutations-queue';
import { mapErrorToUi } from '@/utils/error-mapper';

const NOTIFICATIONS_ROUTE = '/(tabs)/profile/notifications' as Href;
const LOGIN_ROUTE = '/(auth)/login' as Href;

const PROFILE_LOCALE_STORAGE_KEY = 'profile.preferred-locale.v1';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const LOCALE_OPTIONS = [
  { value: 'fr', label: 'Francais' },
  { value: 'en', label: 'English' },
] as const;

const THEME_OPTIONS: { value: ProfileTheme; label: string }[] = [
  { value: 'light', label: 'Clair' },
  { value: 'dark', label: 'Sombre' },
];

interface ProfileFormValues {
  firstName: string;
  lastName: string;
  email: string;
}

interface ProfileFieldErrors {
  firstName?: string;
  lastName?: string;
  email?: string;
}

function shouldQueueAfterError(error: unknown): boolean {
  return !(error instanceof ApiClientError && error.status >= 400 && error.status < 500);
}

function isThemeValue(value: string | undefined): value is ProfileTheme {
  return value === 'light' || value === 'dark';
}

function toPendingAvatarSelection(asset: ImagePicker.ImagePickerAsset): PendingAvatarSelection {
  return {
    uri: asset.uri,
    mimeType: asset.mimeType ?? null,
    fileName: asset.fileName ?? null,
  };
}

function validateProfileForm(values: ProfileFormValues): ProfileFieldErrors {
  const errors: ProfileFieldErrors = {};

  if (!values.firstName.trim()) {
    errors.firstName = 'Le prenom est requis';
  }

  if (!values.lastName.trim()) {
    errors.lastName = 'Le nom est requis';
  }

  if (!EMAIL_PATTERN.test(values.email.trim())) {
    errors.email = 'Email invalide';
  }

  return errors;
}

async function readStoredLocale(): Promise<string | null> {
  const storedLocale = await AsyncStorage.getItem(PROFILE_LOCALE_STORAGE_KEY);
  if (!storedLocale) {
    return null;
  }

  const normalizedLocale = storedLocale.trim();
  return normalizedLocale.length > 0 ? normalizedLocale : null;
}

async function saveStoredLocale(locale: string): Promise<void> {
  await AsyncStorage.setItem(PROFILE_LOCALE_STORAGE_KEY, locale.trim());
}

async function clearStoredLocale(): Promise<void> {
  await AsyncStorage.removeItem(PROFILE_LOCALE_STORAGE_KEY);
}

async function toAvatarBlob(selection: PendingAvatarSelection): Promise<Blob> {
  const response = await fetch(selection.uri);
  if (!response.ok) {
    throw new Error('Impossible de lire l image selectionnee');
  }

  return response.blob();
}


export default function ProfileScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const netInfo = useNetInfo();
  const { clearSession, refreshToken } = useAuth();

  const isOffline = netInfo.isConnected === false || netInfo.isInternetReachable === false;

  const profileQuery = useGetProfile();
  const profile = profileQuery.data?.data;

  const {
    data: pendingProfileMutationsCount = 0,
    refetch: refreshPendingProfileMutationsCount,
  } = useQuery({
    queryKey: ['offline-profile-mutations-count'],
    queryFn: getPendingProfileMutationsCount,
  });

  const {
    data: pendingLogoutRevokesCount = 0,
    refetch: refreshPendingLogoutRevokesCount,
  } = useQuery({
    queryKey: ['offline-logout-revokes-count'],
    queryFn: getPendingLogoutRevokesCount,
  });

  const [profileDraft, setProfileDraft] = useState<ProfileFormValues | null>(null);
  const [profileErrors, setProfileErrors] = useState<ProfileFieldErrors>({});
  const [selectedLocale, setSelectedLocale] = useState('fr');
  const [themeDraft, setThemeDraft] = useState<ProfileTheme | null>(null);
  const [avatarPreviewUri, setAvatarPreviewUri] = useState<string | null>(null);
  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null);

  const [isPickingAvatar, setIsPickingAvatar] = useState(false);
  const [isSubmittingProfile, setIsSubmittingProfile] = useState(false);
  const [isSubmittingLocale, setIsSubmittingLocale] = useState(false);
  const [isSubmittingTheme, setIsSubmittingTheme] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isDeletingAvatar, setIsDeletingAvatar] = useState(false);
  const [isSyncingQueue, setIsSyncingQueue] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const hasAutoSyncedCurrentOnlineSessionRef = useRef(false);

  const profileForm = useMemo<ProfileFormValues>(
    () => ({
      firstName: profileDraft?.firstName ?? profile?.firstName ?? '',
      lastName: profileDraft?.lastName ?? profile?.lastName ?? '',
      email: profileDraft?.email ?? profile?.email ?? '',
    }),
    [profile?.email, profile?.firstName, profile?.lastName, profileDraft]
  );

  const selectedTheme: ProfileTheme =
    themeDraft ?? (isThemeValue(profile?.theme) ? profile.theme : 'light');

  const isBusy =
    isSubmittingProfile ||
    isSubmittingLocale ||
    isSubmittingTheme ||
    isUploadingAvatar ||
    isDeletingAvatar ||
    isSyncingQueue ||
    isPickingAvatar ||
    isLoggingOut;

  const hasPendingActions = pendingProfileMutationsCount > 0 || pendingLogoutRevokesCount > 0;

  useEffect(() => {
    let isCancelled = false;

    async function hydrateLocaleFromStorage() {
      try {
        const storedLocale = await readStoredLocale();
        if (!isCancelled && storedLocale) {
          setSelectedLocale(storedLocale);
        }
      } catch {
        // Best effort only: the UI still works even if locale storage fails.
      }
    }

    void hydrateLocaleFromStorage();

    return () => {
      isCancelled = true;
    };
  }, []);

  const enqueueProfileMutation = useCallback(
    async (input: EnqueuePendingProfileMutationInput, message: string) => {
      await enqueuePendingProfileMutation(input);
      await refreshPendingProfileMutationsCount();
      setSnackbarMessage(message);
    },
    [refreshPendingProfileMutationsCount]
  );

  const handleSyncQueues = useCallback(async () => {
    if (isOffline || isBusy) {
      return;
    }

    setIsSyncingQueue(true);

    try {
      const profileResult = await flushPendingProfileMutations({
        updateProfile: async (payload) => {
          await updateProfile(payload);
        },
        updateLocale: async (payload) => {
          await updateLocale(payload);
          await saveStoredLocale(payload.locale);
        },
        updateSettings: async (payload) => {
          await updateSettings(payload);
        },
        uploadAvatar: async (payload) => {
          const avatarBlob = await toAvatarBlob(payload);
          await uploadAvatar({ file: avatarBlob });
        },
        deleteAvatar: async () => {
          await deleteAvatar();
        },
      });

      const logoutResult = await flushPendingLogoutRevokes(async (queuedRefreshToken) => {
        await revokeRefreshToken({ refreshToken: queuedRefreshToken });
      });

      await Promise.all([refreshPendingProfileMutationsCount(), refreshPendingLogoutRevokesCount()]);

      if (profileResult.syncedCount > 0 || profileResult.failedCount > 0) {
        setAvatarPreviewUri(null);
        await invalidateProfileQueries(queryClient);
      }

      const syncMessages: string[] = [];

      if (profileResult.status === 'retry_later' && profileResult.retryCount > 0) {
        syncMessages.push(
          `${profileResult.syncedCount} action(s) profil synchronisee(s), ${profileResult.retryCount} encore en attente.`
        );
      } else if (profileResult.status === 'failed' && profileResult.failedCount > 0) {
        syncMessages.push(`${profileResult.failedCount} action(s) profil ont echoue.`);
      } else if (profileResult.status === 'synced' && profileResult.syncedCount > 0) {
        syncMessages.push(`${profileResult.syncedCount} action(s) profil synchronisee(s).`);
      }

      if (logoutResult.status === 'retry_later' && logoutResult.retryCount > 0) {
        syncMessages.push(`${logoutResult.retryCount} deconnexion(s) serveur restent en attente.`);
      } else if (logoutResult.status === 'failed' && logoutResult.failedCount > 0) {
        syncMessages.push(`${logoutResult.failedCount} jeton(s) de deconnexion ont ete ignores.`);
      } else if (logoutResult.status === 'synced' && logoutResult.syncedCount > 0) {
        syncMessages.push('Jetons de deconnexion en attente synchronises.');
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
    refreshPendingLogoutRevokesCount,
    refreshPendingProfileMutationsCount,
  ]);

  useEffect(() => {
    if (isOffline) {
      hasAutoSyncedCurrentOnlineSessionRef.current = false;
      return;
    }

    if (
      hasAutoSyncedCurrentOnlineSessionRef.current ||
      isSyncingQueue ||
      (pendingProfileMutationsCount === 0 && pendingLogoutRevokesCount === 0)
    ) {
      return;
    }

    hasAutoSyncedCurrentOnlineSessionRef.current = true;
    void handleSyncQueues();
  }, [
    handleSyncQueues,
    isOffline,
    isSyncingQueue,
    pendingLogoutRevokesCount,
    pendingProfileMutationsCount,
  ]);

  const handleRefresh = useCallback(async () => {
    await Promise.all([
      profileQuery.refetch(),
      refreshPendingProfileMutationsCount(),
      refreshPendingLogoutRevokesCount(),
    ]);
  }, [profileQuery, refreshPendingLogoutRevokesCount, refreshPendingProfileMutationsCount]);

  const handleSaveProfile = useCallback(async () => {
    const normalizedValues: ProfileFormValues = {
      firstName: profileForm.firstName.trim(),
      lastName: profileForm.lastName.trim(),
      email: profileForm.email.trim(),
    };

    const nextErrors = validateProfileForm(normalizedValues);
    setProfileErrors(nextErrors);

    if (nextErrors.firstName || nextErrors.lastName || nextErrors.email) {
      return;
    }

    setProfileDraft(normalizedValues);

    const actionInput: EnqueuePendingProfileMutationInput = {
      type: 'update_profile',
      payload: normalizedValues,
    };

    if (isOffline) {
      await enqueueProfileMutation(actionInput, 'Profil enregistre hors ligne.');
      return;
    }

    setIsSubmittingProfile(true);

    try {
      await updateProfile(normalizedValues);
      await invalidateProfileQueries(queryClient);
      setSnackbarMessage('Profil mis a jour.');
    } catch (error) {
      if (shouldQueueAfterError(error)) {
        await enqueueProfileMutation(actionInput, 'Reseau instable: profil place en file hors ligne.');
        return;
      }

      const uiError = mapErrorToUi(error);
      setProfileErrors({
        firstName: uiError.fieldErrors.firstName,
        lastName: uiError.fieldErrors.lastName,
        email: uiError.fieldErrors.email,
      });
      setSnackbarMessage(uiError.message);
    } finally {
      setIsSubmittingProfile(false);
    }
  }, [enqueueProfileMutation, isOffline, profileForm, queryClient]);

  const handleSaveLocale = useCallback(async () => {
    const locale = selectedLocale.trim();
    if (!locale) {
      setSnackbarMessage('Choisis une langue.');
      return;
    }

    const actionInput: EnqueuePendingProfileMutationInput = {
      type: 'update_locale',
      payload: {
        locale,
      },
    };

    if (isOffline) {
      await saveStoredLocale(locale);
      await enqueueProfileMutation(actionInput, 'Langue enregistree hors ligne.');
      return;
    }

    setIsSubmittingLocale(true);

    try {
      await updateLocale({ locale });
      await saveStoredLocale(locale);
      setSnackbarMessage('Langue mise a jour.');
    } catch (error) {
      if (shouldQueueAfterError(error)) {
        await saveStoredLocale(locale);
        await enqueueProfileMutation(actionInput, 'Reseau instable: langue placee en file hors ligne.');
        return;
      }

      setSnackbarMessage(mapErrorToUi(error).message);
    } finally {
      setIsSubmittingLocale(false);
    }
  }, [enqueueProfileMutation, isOffline, selectedLocale]);

  const handleSaveTheme = useCallback(async () => {
    const actionInput: EnqueuePendingProfileMutationInput = {
      type: 'update_settings',
      payload: {
        theme: selectedTheme,
      },
    };

    if (isOffline) {
      await enqueueProfileMutation(actionInput, 'Theme enregistre hors ligne.');
      return;
    }

    setIsSubmittingTheme(true);

    try {
      await updateSettings(actionInput.payload);
      await invalidateProfileQueries(queryClient);
      setSnackbarMessage('Theme mis a jour.');
    } catch (error) {
      if (shouldQueueAfterError(error)) {
        await enqueueProfileMutation(actionInput, 'Reseau instable: theme place en file hors ligne.');
        return;
      }

      setSnackbarMessage(mapErrorToUi(error).message);
    } finally {
      setIsSubmittingTheme(false);
    }
  }, [enqueueProfileMutation, isOffline, queryClient, selectedTheme]);

  const handlePickAvatar = useCallback(async () => {
    if (isPickingAvatar || isBusy) {
      return;
    }

    setIsPickingAvatar(true);

    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permissionResult.granted) {
        setSnackbarMessage('Autorise l acces a la galerie pour modifier ton avatar.');
        return;
      }

      const pickerResult = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        allowsEditing: true,
      });

      if (pickerResult.canceled || !pickerResult.assets[0]) {
        return;
      }

      const avatarSelection = toPendingAvatarSelection(pickerResult.assets[0]);
      setAvatarPreviewUri(avatarSelection.uri);

      const actionInput: EnqueuePendingProfileMutationInput = {
        type: 'upload_avatar',
        payload: avatarSelection,
      };

      if (isOffline) {
        await enqueueProfileMutation(actionInput, 'Avatar enregistre hors ligne.');
        return;
      }

      setIsUploadingAvatar(true);

      try {
        const avatarBlob = await toAvatarBlob(avatarSelection);
        await uploadAvatar({ file: avatarBlob });
        setAvatarPreviewUri(null);
        await invalidateProfileQueries(queryClient);
        setSnackbarMessage('Avatar mis a jour.');
      } catch (error) {
        if (shouldQueueAfterError(error)) {
          await enqueueProfileMutation(actionInput, 'Reseau instable: avatar place en file hors ligne.');
          return;
        }

        setAvatarPreviewUri(null);
        setSnackbarMessage(mapErrorToUi(error).message);
      } finally {
        setIsUploadingAvatar(false);
      }
    } catch (error) {
      setSnackbarMessage(mapErrorToUi(error).message);
    } finally {
      setIsPickingAvatar(false);
    }
  }, [enqueueProfileMutation, isBusy, isOffline, isPickingAvatar, queryClient]);

  const handleDeleteAvatar = useCallback(async () => {
    const actionInput: EnqueuePendingProfileMutationInput = {
      type: 'delete_avatar',
    };

    setAvatarPreviewUri(null);

    if (isOffline) {
      await enqueueProfileMutation(actionInput, 'Suppression avatar enregistree hors ligne.');
      return;
    }

    setIsDeletingAvatar(true);

    try {
      await deleteAvatar();
      await invalidateProfileQueries(queryClient);
      setSnackbarMessage('Avatar supprime.');
    } catch (error) {
      if (shouldQueueAfterError(error)) {
        await enqueueProfileMutation(actionInput, 'Reseau instable: suppression avatar en file hors ligne.');
        return;
      }

      setSnackbarMessage(mapErrorToUi(error).message);
    } finally {
      setIsDeletingAvatar(false);
    }
  }, [enqueueProfileMutation, isOffline, queryClient]);

  const handleLogout = useCallback(async () => {
    if (isLoggingOut) {
      return;
    }

    setIsLoggingOut(true);

    try {
      if (isOffline && refreshToken) {
        await enqueuePendingLogoutRevoke(refreshToken);
      }

      if (!isOffline && refreshToken) {
        try {
          await revokeRefreshToken({ refreshToken });
        } catch (error) {
          if (shouldQueueAfterError(error)) {
            await enqueuePendingLogoutRevoke(refreshToken);
          }
        }
      }

      await Promise.all([clearPendingProfileMutations(), clearStoredLocale(), clearSession()]);
      queryClient.clear();
      router.replace(LOGIN_ROUTE);
    } finally {
      setIsLoggingOut(false);
    }
  }, [clearSession, isLoggingOut, isOffline, queryClient, refreshToken, router]);

  const displayName = useMemo(() => {
    const fullName = `${profileForm.firstName.trim()} ${profileForm.lastName.trim()}`.trim();
    return fullName || 'Utilisateur';
  }, [profileForm.firstName, profileForm.lastName]);

  const displayEmail = useMemo(() => {
    return profileForm.email.trim() || profile?.email || 'Email non renseigne';
  }, [profile?.email, profileForm.email]);

  const displayAvatarUri = avatarPreviewUri ?? profile?.avatarUrl ?? null;

  const isRefreshing = profileQuery.isFetching || isSyncingQueue;
  const disableProfileActions = isBusy || (profileQuery.isLoading && !profile);

  return (
    <ScreenShell title="Profil" subtitle="Gere ton compte, ta langue, ton theme et ton avatar.">
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => void handleRefresh()} />}>
        {isOffline ? (
          <Text style={styles.offlineText}>Tu es hors ligne: les changements seront synchronises plus tard.</Text>
        ) : null}

        {hasPendingActions ? (
          <Card mode="outlined" style={styles.pendingCard}>
            <Card.Content style={styles.pendingCardContent}>
              {pendingProfileMutationsCount > 0 ? (
                <Text>{pendingProfileMutationsCount} action(s) profil en attente de synchronisation.</Text>
              ) : null}
              {pendingLogoutRevokesCount > 0 ? (
                <Text>{pendingLogoutRevokesCount} revoke(s) de deconnexion en attente.</Text>
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
          <Card.Content style={styles.identityCardContent}>
            <View style={styles.identityRow}>
              <View style={styles.avatarContainer}>
                {displayAvatarUri ? (
                  <Image source={{ uri: displayAvatarUri }} style={styles.avatarImage} />
                ) : (
                  <MaterialCommunityIcons name="account-outline" size={36} color="#2D6A4F" />
                )}
              </View>

              <View style={styles.identityTextBlock}>
                <Text variant="titleMedium" style={styles.identityName}>
                  {displayName}
                </Text>
                <Text>{displayEmail}</Text>
              </View>
            </View>

            {!profile && profileQuery.isLoading ? <Text>Chargement du profil...</Text> : null}
          </Card.Content>
        </Card>

        <Card mode="outlined">
          <Card.Content style={styles.sectionContent}>
            <Text variant="titleMedium">Informations</Text>

            <TextInput
              mode="outlined"
              label="Prenom"
              value={profileForm.firstName}
              onChangeText={(value) => {
                setProfileDraft({
                  ...profileForm,
                  firstName: value,
                });
                setProfileErrors((currentErrors) => ({
                  ...currentErrors,
                  firstName: undefined,
                }));
              }}
              error={Boolean(profileErrors.firstName)}
              disabled={disableProfileActions}
            />
            <HelperText type="error" visible={Boolean(profileErrors.firstName)}>
              {profileErrors.firstName}
            </HelperText>

            <TextInput
              mode="outlined"
              label="Nom"
              value={profileForm.lastName}
              onChangeText={(value) => {
                setProfileDraft({
                  ...profileForm,
                  lastName: value,
                });
                setProfileErrors((currentErrors) => ({
                  ...currentErrors,
                  lastName: undefined,
                }));
              }}
              error={Boolean(profileErrors.lastName)}
              disabled={disableProfileActions}
            />
            <HelperText type="error" visible={Boolean(profileErrors.lastName)}>
              {profileErrors.lastName}
            </HelperText>

            <TextInput
              mode="outlined"
              label="Email"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              value={profileForm.email}
              onChangeText={(value) => {
                setProfileDraft({
                  ...profileForm,
                  email: value,
                });
                setProfileErrors((currentErrors) => ({
                  ...currentErrors,
                  email: undefined,
                }));
              }}
              error={Boolean(profileErrors.email)}
              disabled={disableProfileActions}
            />
            <HelperText type="error" visible={Boolean(profileErrors.email)}>
              {profileErrors.email}
            </HelperText>

            <Button
              mode="contained"
              onPress={() => void handleSaveProfile()}
              loading={isSubmittingProfile}
              disabled={disableProfileActions}>
              Enregistrer le profil
            </Button>
          </Card.Content>
        </Card>

        <Card mode="outlined">
          <Card.Content style={styles.sectionContent}>
            <Text variant="titleMedium">Langue preferee</Text>
            <View style={styles.optionsWrap}>
              {LOCALE_OPTIONS.map((option) => {
                const isSelected = selectedLocale === option.value;

                return (
                  <Chip
                    key={option.value}
                    selected={isSelected}
                    mode={isSelected ? 'flat' : 'outlined'}
                    onPress={() => setSelectedLocale(option.value)}
                    disabled={isBusy}>
                    {option.label}
                  </Chip>
                );
              })}
            </View>

            <Button
              mode="contained-tonal"
              onPress={() => void handleSaveLocale()}
              loading={isSubmittingLocale}
              disabled={isBusy}>
              Enregistrer la langue
            </Button>
          </Card.Content>
        </Card>

        <Card mode="outlined">
          <Card.Content style={styles.sectionContent}>
            <Text variant="titleMedium">Theme</Text>
            <View style={styles.optionsWrap}>
              {THEME_OPTIONS.map((option) => {
                const isSelected = selectedTheme === option.value;

                return (
                  <Chip
                    key={option.value}
                    selected={isSelected}
                    mode={isSelected ? 'flat' : 'outlined'}
                    onPress={() => setThemeDraft(option.value)}
                    disabled={isBusy}>
                    {option.label}
                  </Chip>
                );
              })}
            </View>

            <Button
              mode="contained-tonal"
              onPress={() => void handleSaveTheme()}
              loading={isSubmittingTheme}
              disabled={isBusy}>
              Enregistrer le theme
            </Button>
          </Card.Content>
        </Card>

        <Card mode="outlined">
          <Card.Content style={styles.sectionContent}>
            <Text variant="titleMedium">Avatar</Text>
            <View style={styles.avatarActionsRow}>
              <Button
                mode="outlined"
                icon="image-outline"
                onPress={() => void handlePickAvatar()}
                loading={isPickingAvatar || isUploadingAvatar}
                disabled={isBusy}>
                Choisir une image
              </Button>

              <Button
                mode="outlined"
                icon="delete-outline"
                onPress={() => void handleDeleteAvatar()}
                loading={isDeletingAvatar}
                disabled={isBusy || !displayAvatarUri}>
                Supprimer l avatar
              </Button>
            </View>
          </Card.Content>
        </Card>

        <Card mode="outlined">
          <Card.Content style={styles.sectionContent}>
            <Text variant="titleMedium">Compte</Text>
            <View style={styles.accountActions}>
              <Button mode="outlined" icon="bell-outline" onPress={() => router.push(NOTIFICATIONS_ROUTE)}>
                Parametres de notifications
              </Button>

              <Button
                mode="contained"
                buttonColor="#D90429"
                onPress={() => void handleLogout()}
                loading={isLoggingOut}
                disabled={isBusy}>
                Se deconnecter
              </Button>
            </View>
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
  identityCardContent: {
    gap: 10,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#D8F3DC',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  identityTextBlock: {
    flex: 1,
    gap: 2,
  },
  identityName: {
    fontWeight: '600',
  },
  sectionContent: {
    gap: 10,
  },
  optionsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  avatarActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  accountActions: {
    gap: 8,
  },
});

