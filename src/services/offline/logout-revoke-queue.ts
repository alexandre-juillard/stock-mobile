import AsyncStorage from '@react-native-async-storage/async-storage';

import { ApiClientError } from '@/services/api/http-client';

const LOGOUT_REVOKE_QUEUE_KEY = 'offline.auth.logout-revokes.v1';

interface PendingLogoutRevoke {
  revokeId: string;
  refreshToken: string;
  queuedAt: string;
  attempts: number;
  lastErrorMessage?: string;
}

export interface FlushPendingLogoutRevokesResult {
  status: 'none' | 'synced' | 'retry_later' | 'failed';
  syncedCount: number;
  retryCount: number;
  failedCount: number;
}

function createRevokeId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

async function readQueue(): Promise<PendingLogoutRevoke[]> {
  const rawValue = await AsyncStorage.getItem(LOGOUT_REVOKE_QUEUE_KEY);
  if (!rawValue) {
    return [];
  }

  try {
    const parsedValue = JSON.parse(rawValue);
    if (!Array.isArray(parsedValue)) {
      await AsyncStorage.removeItem(LOGOUT_REVOKE_QUEUE_KEY);
      return [];
    }

    return parsedValue as PendingLogoutRevoke[];
  } catch {
    await AsyncStorage.removeItem(LOGOUT_REVOKE_QUEUE_KEY);
    return [];
  }
}

async function writeQueue(queue: PendingLogoutRevoke[]): Promise<void> {
  if (queue.length === 0) {
    await AsyncStorage.removeItem(LOGOUT_REVOKE_QUEUE_KEY);
    return;
  }

  await AsyncStorage.setItem(LOGOUT_REVOKE_QUEUE_KEY, JSON.stringify(queue));
}

export async function enqueuePendingLogoutRevoke(refreshToken: string): Promise<void> {
  const normalizedRefreshToken = refreshToken.trim();
  if (!normalizedRefreshToken) {
    return;
  }

  const queue = await readQueue();
  queue.push({
    revokeId: createRevokeId(),
    refreshToken: normalizedRefreshToken,
    queuedAt: new Date().toISOString(),
    attempts: 0,
  });

  await writeQueue(queue);
}

export async function clearPendingLogoutRevokes(): Promise<void> {
  await AsyncStorage.removeItem(LOGOUT_REVOKE_QUEUE_KEY);
}

export async function getPendingLogoutRevokesCount(): Promise<number> {
  const queue = await readQueue();
  return queue.length;
}

export async function flushPendingLogoutRevokes(
  sync: (refreshToken: string) => Promise<void>
): Promise<FlushPendingLogoutRevokesResult> {
  const queue = await readQueue();
  if (queue.length === 0) {
    return {
      status: 'none',
      syncedCount: 0,
      retryCount: 0,
      failedCount: 0,
    };
  }

  const retryQueue: PendingLogoutRevoke[] = [];
  let syncedCount = 0;
  let failedCount = 0;

  for (const revoke of queue) {
    try {
      await sync(revoke.refreshToken);
      syncedCount += 1;
    } catch (error) {
      if (error instanceof ApiClientError && error.status >= 400 && error.status < 500) {
        failedCount += 1;
        continue;
      }

      retryQueue.push({
        ...revoke,
        attempts: revoke.attempts + 1,
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

