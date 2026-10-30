import type { ResendConfirmationRequest } from '@/services/api/generated/model';
import { createSingleRequestQueue } from '@/services/offline/offline-queue';

interface FlushResult {
  status: 'none' | 'synced' | 'retry_later' | 'failed';
  email?: string;
  message?: string;
}

const queue = createSingleRequestQueue<ResendConfirmationRequest>(
  'offline.auth.resend-confirmation.v1',
  'Renvoi de confirmation en attente de synchronisation'
);

export async function enqueuePendingResendConfirmation(
  request: ResendConfirmationRequest
): Promise<void> {
  await queue.enqueue(request);
}

export async function clearPendingResendConfirmation(): Promise<void> {
  await queue.clear();
}

export async function flushPendingResendConfirmation(
  sync: (request: ResendConfirmationRequest) => Promise<void>
): Promise<FlushResult> {
  const result = await queue.flush(sync);
  return result.status === 'synced' ? { status: 'synced', email: result.request.email } : result;
}
