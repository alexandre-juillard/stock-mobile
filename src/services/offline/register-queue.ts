import type { RegisterRequest } from '@/services/api/generated/model';
import { createSingleRequestQueue } from '@/services/offline/offline-queue';

interface FlushResult {
  status: 'none' | 'synced' | 'retry_later' | 'failed';
  email?: string;
  message?: string;
}

const queue = createSingleRequestQueue<RegisterRequest>(
  'offline.auth.register.v1',
  'Inscription en attente de synchronisation'
);

export async function enqueuePendingRegister(request: RegisterRequest): Promise<void> {
  await queue.enqueue(request);
}

export async function clearPendingRegister(): Promise<void> {
  await queue.clear();
}

export async function flushPendingRegister(
  sync: (request: RegisterRequest) => Promise<void>
): Promise<FlushResult> {
  const result = await queue.flush(sync);
  return result.status === 'synced' ? { status: 'synced', email: result.request.email } : result;
}
