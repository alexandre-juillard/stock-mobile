import type { LinkDecisionRequest, LoginResponse } from '@/services/api/generated/model';
import { createSingleRequestQueue } from '@/services/offline/offline-queue';

interface FlushResult {
  status: 'none' | 'synced' | 'retry_later' | 'failed';
  tokens?: LoginResponse;
  message?: string;
}

const queue = createSingleRequestQueue<LinkDecisionRequest>(
  'offline.auth.oauth2-link-decision.v1',
  'Decision en attente de synchronisation'
);

export async function enqueuePendingOAuth2LinkDecision(request: LinkDecisionRequest): Promise<void> {
  await queue.enqueue(request);
}

export async function clearPendingOAuth2LinkDecision(): Promise<void> {
  await queue.clear();
}

export async function flushPendingOAuth2LinkDecision(
  sync: (request: LinkDecisionRequest) => Promise<LoginResponse>
): Promise<FlushResult> {
  const result = await queue.flush(sync);
  return result.status === 'synced' ? { status: 'synced', tokens: result.result } : result;
}
