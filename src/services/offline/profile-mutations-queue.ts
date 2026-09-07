import AsyncStorage from '@react-native-async-storage/async-storage';

import { ApiClientError } from '@/services/api/http-client';

const PROFILE_MUTATIONS_QUEUE_KEY = 'offline.profile.mutations.v1';

export type ProfileTheme = 'light' | 'dark';

export interface PendingAvatarSelection {
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
}

interface PendingProfileMutationBase {
  mutationId: string;
  type: 'update_profile' | 'update_locale' | 'update_settings' | 'upload_avatar' | 'delete_avatar';
  queuedAt: string;
  attempts: number;
  lastErrorMessage?: string;
}

interface PendingUpdateProfileMutation extends PendingProfileMutationBase {
  type: 'update_profile';
  payload: {
    firstName: string;
    lastName: string;
    email: string;
  };
}

interface PendingUpdateLocaleMutation extends PendingProfileMutationBase {
  type: 'update_locale';
  payload: {
    locale: string;
  };
}

interface PendingUpdateSettingsMutation extends PendingProfileMutationBase {
  type: 'update_settings';
  payload: {
    theme: ProfileTheme;
    expirationAlertDays?: number;
  };
}

interface PendingUploadAvatarMutation extends PendingProfileMutationBase {
  type: 'upload_avatar';
  payload: PendingAvatarSelection;
}

interface PendingDeleteAvatarMutation extends PendingProfileMutationBase {
  type: 'delete_avatar';
}

type PendingProfileMutation =
  | PendingUpdateProfileMutation
  | PendingUpdateLocaleMutation
  | PendingUpdateSettingsMutation
  | PendingUploadAvatarMutation
  | PendingDeleteAvatarMutation;

export type EnqueuePendingProfileMutationInput =
  | {
      type: 'update_profile';
      payload: {
        firstName: string;
        lastName: string;
        email: string;
      };
    }
  | {
      type: 'update_locale';
      payload: {
        locale: string;
      };
    }
  | {
      type: 'update_settings';
      payload: {
        theme: ProfileTheme;
        expirationAlertDays?: number;
      };
    }
  | {
      type: 'upload_avatar';
      payload: PendingAvatarSelection;
    }
  | {
      type: 'delete_avatar';
    };

interface ProfileMutationSyncHandlers {
  updateProfile: (payload: { firstName: string; lastName: string; email: string }) => Promise<void>;
  updateLocale: (payload: { locale: string }) => Promise<void>;
  updateSettings: (payload: { theme: ProfileTheme; expirationAlertDays?: number }) => Promise<void>;
  uploadAvatar: (payload: PendingAvatarSelection) => Promise<void>;
  deleteAvatar: () => Promise<void>;
}

export interface FlushPendingProfileMutationsResult {
  status: 'none' | 'synced' | 'retry_later' | 'failed';
  syncedCount: number;
  retryCount: number;
  failedCount: number;
}

function createMutationId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function toPendingProfileMutation(input: EnqueuePendingProfileMutationInput): PendingProfileMutation {
  const baseMutation: PendingProfileMutationBase = {
    mutationId: createMutationId(),
    type: input.type,
    queuedAt: new Date().toISOString(),
    attempts: 0,
  };

  if (input.type === 'update_profile') {
    return {
      ...baseMutation,
      type: 'update_profile',
      payload: input.payload,
    };
  }

  if (input.type === 'update_locale') {
    return {
      ...baseMutation,
      type: 'update_locale',
      payload: input.payload,
    };
  }

  if (input.type === 'update_settings') {
    return {
      ...baseMutation,
      type: 'update_settings',
      payload: input.payload,
    };
  }

  if (input.type === 'upload_avatar') {
    return {
      ...baseMutation,
      type: 'upload_avatar',
      payload: input.payload,
    };
  }

  return {
    ...baseMutation,
    type: 'delete_avatar',
  };
}

async function readQueue(): Promise<PendingProfileMutation[]> {
  const rawValue = await AsyncStorage.getItem(PROFILE_MUTATIONS_QUEUE_KEY);
  if (!rawValue) {
    return [];
  }

  try {
    const parsedValue = JSON.parse(rawValue);
    if (!Array.isArray(parsedValue)) {
      await AsyncStorage.removeItem(PROFILE_MUTATIONS_QUEUE_KEY);
      return [];
    }

    return parsedValue as PendingProfileMutation[];
  } catch {
    await AsyncStorage.removeItem(PROFILE_MUTATIONS_QUEUE_KEY);
    return [];
  }
}

async function writeQueue(queue: PendingProfileMutation[]): Promise<void> {
  if (queue.length === 0) {
    await AsyncStorage.removeItem(PROFILE_MUTATIONS_QUEUE_KEY);
    return;
  }

  await AsyncStorage.setItem(PROFILE_MUTATIONS_QUEUE_KEY, JSON.stringify(queue));
}

async function executeMutation(
  mutation: PendingProfileMutation,
  syncHandlers: ProfileMutationSyncHandlers
): Promise<void> {
  if (mutation.type === 'update_profile') {
    await syncHandlers.updateProfile(mutation.payload);
    return;
  }

  if (mutation.type === 'update_locale') {
    await syncHandlers.updateLocale(mutation.payload);
    return;
  }

  if (mutation.type === 'update_settings') {
    await syncHandlers.updateSettings(mutation.payload);
    return;
  }

  if (mutation.type === 'upload_avatar') {
    await syncHandlers.uploadAvatar(mutation.payload);
    return;
  }

  await syncHandlers.deleteAvatar();
}

export async function enqueuePendingProfileMutation(
  input: EnqueuePendingProfileMutationInput
): Promise<void> {
  const queue = await readQueue();
  queue.push(toPendingProfileMutation(input));
  await writeQueue(queue);
}

export async function clearPendingProfileMutations(): Promise<void> {
  await AsyncStorage.removeItem(PROFILE_MUTATIONS_QUEUE_KEY);
}

export async function getPendingProfileMutationsCount(): Promise<number> {
  const queue = await readQueue();
  return queue.length;
}

export async function flushPendingProfileMutations(
  syncHandlers: ProfileMutationSyncHandlers
): Promise<FlushPendingProfileMutationsResult> {
  const queue = await readQueue();
  if (queue.length === 0) {
    return {
      status: 'none',
      syncedCount: 0,
      retryCount: 0,
      failedCount: 0,
    };
  }

  const retryQueue: PendingProfileMutation[] = [];
  let syncedCount = 0;
  let failedCount = 0;

  for (const mutation of queue) {
    try {
      await executeMutation(mutation, syncHandlers);
      syncedCount += 1;
    } catch (error) {
      if (error instanceof ApiClientError && error.status >= 400 && error.status < 500) {
        failedCount += 1;
        continue;
      }

      retryQueue.push({
        ...mutation,
        attempts: mutation.attempts + 1,
        lastErrorMessage: error instanceof Error ? error.message : 'Erreur de synchronisation',
      });
    }
  }

  await writeQueue(retryQueue);

  if (retryQueue.length > 0) {
    return {
      status: 'retry_later',
      syncedCount,
      retryCount: retryQueue.length,
      failedCount,
    };
  }

  if (failedCount > 0) {
    return {
      status: 'failed',
      syncedCount,
      retryCount: 0,
      failedCount,
    };
  }

  return {
    status: 'synced',
    syncedCount,
    retryCount: 0,
    failedCount: 0,
  };
}

