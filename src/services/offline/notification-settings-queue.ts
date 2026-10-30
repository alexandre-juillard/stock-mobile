import {
  createPersistentQueue,
  createQueueEntryId,
  createQueuedEntryMeta,
  type QueueFlushResult,
  type QueuedEntryMeta,
} from '@/services/offline/offline-queue';

interface PendingNotificationSettingsMutation extends QueuedEntryMeta {
  mutationId: string;
  type: 'update_expiration_alert_days';
  payload: {
    expirationAlertDays: number;
  };
}

export interface EnqueuePendingNotificationSettingsMutationInput {
  expirationAlertDays: number;
}

interface NotificationSettingsSyncHandlers {
  updateSettings: (payload: { expirationAlertDays: number }) => Promise<void>;
}

export type FlushPendingNotificationSettingsMutationsResult = QueueFlushResult;

const queue = createPersistentQueue<PendingNotificationSettingsMutation>(
  'offline.notification-settings.mutations.v1'
);

export async function enqueuePendingNotificationSettingsMutation(
  input: EnqueuePendingNotificationSettingsMutationInput
): Promise<void> {
  await queue.append({
    mutationId: createQueueEntryId(),
    type: 'update_expiration_alert_days',
    payload: {
      expirationAlertDays: input.expirationAlertDays,
    },
    ...createQueuedEntryMeta(),
  });
}

export async function getPendingNotificationSettingsMutationsCount(): Promise<number> {
  return queue.count();
}

export async function getLatestPendingExpirationAlertDays(): Promise<number | null> {
  const pendingMutations = await queue.read();
  for (let index = pendingMutations.length - 1; index >= 0; index -= 1) {
    const pendingMutation = pendingMutations[index];
    if (pendingMutation?.type === 'update_expiration_alert_days') {
      return pendingMutation.payload.expirationAlertDays;
    }
  }

  return null;
}

export async function flushPendingNotificationSettingsMutations(
  syncHandlers: NotificationSettingsSyncHandlers
): Promise<FlushPendingNotificationSettingsMutationsResult> {
  return queue.flush((mutation) => syncHandlers.updateSettings(mutation.payload));
}
