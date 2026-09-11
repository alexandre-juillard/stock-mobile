import AsyncStorage from '@react-native-async-storage/async-storage';

import { ApiClientError } from '@/services/api/http-client';

const NOTIFICATION_SETTINGS_QUEUE_KEY = 'offline.notification-settings.mutations.v1';

interface PendingNotificationSettingsMutation {
  mutationId: string;
  type: 'update_expiration_alert_days';
  payload: {
    expirationAlertDays: number;
  };
  queuedAt: string;
  attempts: number;
  lastErrorMessage?: string;
}

export interface EnqueuePendingNotificationSettingsMutationInput {
  expirationAlertDays: number;
}

interface NotificationSettingsSyncHandlers {
  updateSettings: (payload: { expirationAlertDays: number }) => Promise<void>;
}

export interface FlushPendingNotificationSettingsMutationsResult {
  status: 'none' | 'synced' | 'retry_later' | 'failed';
  syncedCount: number;
  retryCount: number;
  failedCount: number;
}

function createMutationId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function toPendingMutation(
  input: EnqueuePendingNotificationSettingsMutationInput
): PendingNotificationSettingsMutation {
  return {
    mutationId: createMutationId(),
    type: 'update_expiration_alert_days',
    payload: {
      expirationAlertDays: input.expirationAlertDays,
    },
    queuedAt: new Date().toISOString(),
    attempts: 0,
  };
}

async function readQueue(): Promise<PendingNotificationSettingsMutation[]> {
  const rawValue = await AsyncStorage.getItem(NOTIFICATION_SETTINGS_QUEUE_KEY);
  if (!rawValue) {
    return [];
  }

  try {
    const parsedValue = JSON.parse(rawValue);
    if (!Array.isArray(parsedValue)) {
      await AsyncStorage.removeItem(NOTIFICATION_SETTINGS_QUEUE_KEY);
      return [];
    }

    return parsedValue as PendingNotificationSettingsMutation[];
  } catch {
    await AsyncStorage.removeItem(NOTIFICATION_SETTINGS_QUEUE_KEY);
    return [];
  }
}

async function writeQueue(queue: PendingNotificationSettingsMutation[]): Promise<void> {
  if (queue.length === 0) {
    await AsyncStorage.removeItem(NOTIFICATION_SETTINGS_QUEUE_KEY);
    return;
  }

  await AsyncStorage.setItem(NOTIFICATION_SETTINGS_QUEUE_KEY, JSON.stringify(queue));
}

export async function enqueuePendingNotificationSettingsMutation(
  input: EnqueuePendingNotificationSettingsMutationInput
): Promise<void> {
  const queue = await readQueue();
  queue.push(toPendingMutation(input));
  await writeQueue(queue);
}

export async function getPendingNotificationSettingsMutationsCount(): Promise<number> {
  const queue = await readQueue();
  return queue.length;
}

export async function getLatestPendingExpirationAlertDays(): Promise<number | null> {
  const queue = await readQueue();
  for (let index = queue.length - 1; index >= 0; index -= 1) {
    const pendingMutation = queue[index];
    if (pendingMutation?.type === 'update_expiration_alert_days') {
      return pendingMutation.payload.expirationAlertDays;
    }
  }

  return null;
}

export async function flushPendingNotificationSettingsMutations(
  syncHandlers: NotificationSettingsSyncHandlers
): Promise<FlushPendingNotificationSettingsMutationsResult> {
  const queue = await readQueue();
  if (queue.length === 0) {
    return {
      status: 'none',
      syncedCount: 0,
      retryCount: 0,
      failedCount: 0,
    };
  }

  const retryQueue: PendingNotificationSettingsMutation[] = [];
  let syncedCount = 0;
  let failedCount = 0;

  for (const mutation of queue) {
    try {
      await syncHandlers.updateSettings(mutation.payload);
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

