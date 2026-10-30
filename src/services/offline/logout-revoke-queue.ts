import {
  createPersistentQueue,
  createQueueEntryId,
  createQueuedEntryMeta,
  type QueueFlushResult,
  type QueuedEntryMeta,
} from '@/services/offline/offline-queue';

interface PendingLogoutRevoke extends QueuedEntryMeta {
  revokeId: string;
  refreshToken: string;
}

export type FlushPendingLogoutRevokesResult = QueueFlushResult;

const queue = createPersistentQueue<PendingLogoutRevoke>('offline.auth.logout-revokes.v1');

export async function enqueuePendingLogoutRevoke(refreshToken: string): Promise<void> {
  const normalizedRefreshToken = refreshToken.trim();
  if (!normalizedRefreshToken) {
    return;
  }

  await queue.append({
    revokeId: createQueueEntryId(),
    refreshToken: normalizedRefreshToken,
    ...createQueuedEntryMeta(),
  });
}

export async function clearPendingLogoutRevokes(): Promise<void> {
  await queue.clear();
}

export async function getPendingLogoutRevokesCount(): Promise<number> {
  return queue.count();
}

export async function flushPendingLogoutRevokes(
  sync: (refreshToken: string) => Promise<void>
): Promise<FlushPendingLogoutRevokesResult> {
  return queue.flush((revoke) => sync(revoke.refreshToken));
}
