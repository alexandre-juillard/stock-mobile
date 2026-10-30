import type { ForgotPasswordRequest } from '@/services/api/generated/model';
import { createSingleRequestQueue } from '@/services/offline/offline-queue';

interface FlushResult {
  status: 'none' | 'synced' | 'retry_later' | 'failed';
  email?: string;
  message?: string;
}

const queue = createSingleRequestQueue<ForgotPasswordRequest>(
  'offline.auth.forgot-password.v1',
  'Demande en attente de synchronisation'
);

export async function enqueuePendingForgotPassword(request: ForgotPasswordRequest): Promise<void> {
  await queue.enqueue(request);
}

export async function clearPendingForgotPassword(): Promise<void> {
  await queue.clear();
}

export async function flushPendingForgotPassword(
  sync: (request: ForgotPasswordRequest) => Promise<void>
): Promise<FlushResult> {
  const result = await queue.flush(sync);
  return result.status === 'synced' ? { status: 'synced', email: result.request.email } : result;
}
