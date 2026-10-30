import type { RegisterPushTokenRequestPlatform } from '@/services/api/generated/model';
import {
  createPersistentQueue,
  createQueueEntryId,
  createQueuedEntryMeta,
  type QueueFlushResult,
  type QueuedEntryMeta,
} from '@/services/offline/offline-queue';

export type EnqueuePendingPushTokenActionInput =
  | {
      type: 'register_token';
      payload: {
        token: string;
        platform: RegisterPushTokenRequestPlatform;
      };
    }
  | {
      type: 'unregister_token';
      payload: {
        token: string;
      };
    };

type PendingPushTokenAction = EnqueuePendingPushTokenActionInput &
  QueuedEntryMeta & {
    actionId: string;
  };

interface PushTokenSyncHandlers {
  registerToken: (payload: {
    token: string;
    platform: RegisterPushTokenRequestPlatform;
  }) => Promise<void>;
  unregisterToken: (payload: { token: string }) => Promise<void>;
}

export type FlushPendingPushTokenActionsResult = QueueFlushResult;

const queue = createPersistentQueue<PendingPushTokenAction>('offline.push-token.actions.v1');

async function executeAction(
  action: PendingPushTokenAction,
  syncHandlers: PushTokenSyncHandlers
): Promise<void> {
  switch (action.type) {
    case 'register_token':
      return syncHandlers.registerToken(action.payload);
    case 'unregister_token':
      return syncHandlers.unregisterToken(action.payload);
  }
}

export async function enqueuePendingPushTokenAction(
  input: EnqueuePendingPushTokenActionInput
): Promise<void> {
  await queue.append({ ...input, actionId: createQueueEntryId(), ...createQueuedEntryMeta() });
}

export async function getPendingPushTokenActionsCount(): Promise<number> {
  return queue.count();
}

export async function flushPendingPushTokenActions(
  syncHandlers: PushTokenSyncHandlers
): Promise<FlushPendingPushTokenActionsResult> {
  return queue.flush((action) => executeAction(action, syncHandlers));
}
