import {
  createPersistentQueue,
  createQueueEntryId,
  createQueuedEntryMeta,
  type QueueFlushResult,
  type QueuedEntryMeta,
} from '@/services/offline/offline-queue';

export type ProfileTheme = 'light' | 'dark';

export interface PendingAvatarSelection {
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
}

interface ProfileIdentityPayload {
  firstName: string;
  lastName: string;
  email: string;
}

interface ProfileLocalePayload {
  locale: string;
}

interface ProfileSettingsPayload {
  theme: ProfileTheme;
  expirationAlertDays?: number;
}

export type EnqueuePendingProfileMutationInput =
  | {
      type: 'update_profile';
      payload: ProfileIdentityPayload;
    }
  | {
      type: 'update_locale';
      payload: ProfileLocalePayload;
    }
  | {
      type: 'update_settings';
      payload: ProfileSettingsPayload;
    }
  | {
      type: 'upload_avatar';
      payload: PendingAvatarSelection;
    }
  | {
      type: 'delete_avatar';
    };

type PendingProfileMutation = EnqueuePendingProfileMutationInput &
  QueuedEntryMeta & {
    mutationId: string;
  };

interface ProfileMutationSyncHandlers {
  updateProfile: (payload: ProfileIdentityPayload) => Promise<void>;
  updateLocale: (payload: ProfileLocalePayload) => Promise<void>;
  updateSettings: (payload: ProfileSettingsPayload) => Promise<void>;
  uploadAvatar: (payload: PendingAvatarSelection) => Promise<void>;
  deleteAvatar: () => Promise<void>;
}

export type FlushPendingProfileMutationsResult = QueueFlushResult;

const queue = createPersistentQueue<PendingProfileMutation>('offline.profile.mutations.v1');

async function executeMutation(
  mutation: PendingProfileMutation,
  syncHandlers: ProfileMutationSyncHandlers
): Promise<void> {
  switch (mutation.type) {
    case 'update_profile':
      return syncHandlers.updateProfile(mutation.payload);
    case 'update_locale':
      return syncHandlers.updateLocale(mutation.payload);
    case 'update_settings':
      return syncHandlers.updateSettings(mutation.payload);
    case 'upload_avatar':
      return syncHandlers.uploadAvatar(mutation.payload);
    case 'delete_avatar':
      return syncHandlers.deleteAvatar();
  }
}

export async function enqueuePendingProfileMutation(
  input: EnqueuePendingProfileMutationInput
): Promise<void> {
  await queue.append({ ...input, mutationId: createQueueEntryId(), ...createQueuedEntryMeta() });
}

export async function clearPendingProfileMutations(): Promise<void> {
  await queue.clear();
}

export async function getPendingProfileMutationsCount(): Promise<number> {
  return queue.count();
}

export async function flushPendingProfileMutations(
  syncHandlers: ProfileMutationSyncHandlers
): Promise<FlushPendingProfileMutationsResult> {
  return queue.flush((mutation) => executeMutation(mutation, syncHandlers));
}
