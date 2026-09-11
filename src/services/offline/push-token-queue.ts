import AsyncStorage from '@react-native-async-storage/async-storage';

import type { RegisterPushTokenRequestPlatform } from '@/services/api/generated/model';
import { ApiClientError } from '@/services/api/http-client';

const PUSH_TOKEN_QUEUE_KEY = 'offline.push-token.actions.v1';

interface PendingPushTokenActionBase {
  actionId: string;
  type: 'register_token' | 'unregister_token';
  queuedAt: string;
  attempts: number;
  lastErrorMessage?: string;
}

interface PendingRegisterTokenAction extends PendingPushTokenActionBase {
  type: 'register_token';
  payload: {
    token: string;
    platform: RegisterPushTokenRequestPlatform;
  };
}

interface PendingUnregisterTokenAction extends PendingPushTokenActionBase {
  type: 'unregister_token';
  payload: {
    token: string;
  };
}

type PendingPushTokenAction = PendingRegisterTokenAction | PendingUnregisterTokenAction;

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

interface PushTokenSyncHandlers {
  registerToken: (payload: {
    token: string;
    platform: RegisterPushTokenRequestPlatform;
  }) => Promise<void>;
  unregisterToken: (payload: { token: string }) => Promise<void>;
}

export interface FlushPendingPushTokenActionsResult {
  status: 'none' | 'synced' | 'retry_later' | 'failed';
  syncedCount: number;
  retryCount: number;
  failedCount: number;
}

function createActionId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function toPendingAction(input: EnqueuePendingPushTokenActionInput): PendingPushTokenAction {
  const baseAction: PendingPushTokenActionBase = {
    actionId: createActionId(),
    type: input.type,
    queuedAt: new Date().toISOString(),
    attempts: 0,
  };

  if (input.type === 'register_token') {
    return {
      ...baseAction,
      type: 'register_token',
      payload: input.payload,
    };
  }

  return {
    ...baseAction,
    type: 'unregister_token',
    payload: input.payload,
  };
}

async function readQueue(): Promise<PendingPushTokenAction[]> {
  const rawValue = await AsyncStorage.getItem(PUSH_TOKEN_QUEUE_KEY);
  if (!rawValue) {
    return [];
  }

  try {
    const parsedValue = JSON.parse(rawValue);
    if (!Array.isArray(parsedValue)) {
      await AsyncStorage.removeItem(PUSH_TOKEN_QUEUE_KEY);
      return [];
    }

    return parsedValue as PendingPushTokenAction[];
  } catch {
    await AsyncStorage.removeItem(PUSH_TOKEN_QUEUE_KEY);
    return [];
  }
}

async function writeQueue(queue: PendingPushTokenAction[]): Promise<void> {
  if (queue.length === 0) {
    await AsyncStorage.removeItem(PUSH_TOKEN_QUEUE_KEY);
    return;
  }

  await AsyncStorage.setItem(PUSH_TOKEN_QUEUE_KEY, JSON.stringify(queue));
}

async function executeAction(action: PendingPushTokenAction, syncHandlers: PushTokenSyncHandlers): Promise<void> {
  if (action.type === 'register_token') {
    await syncHandlers.registerToken(action.payload);
    return;
  }

  await syncHandlers.unregisterToken(action.payload);
}

export async function enqueuePendingPushTokenAction(
  input: EnqueuePendingPushTokenActionInput
): Promise<void> {
  const queue = await readQueue();
  queue.push(toPendingAction(input));
  await writeQueue(queue);
}

export async function getPendingPushTokenActionsCount(): Promise<number> {
  const queue = await readQueue();
  return queue.length;
}

export async function flushPendingPushTokenActions(
  syncHandlers: PushTokenSyncHandlers
): Promise<FlushPendingPushTokenActionsResult> {
  const queue = await readQueue();
  if (queue.length === 0) {
    return {
      status: 'none',
      syncedCount: 0,
      retryCount: 0,
      failedCount: 0,
    };
  }

  const retryQueue: PendingPushTokenAction[] = [];
  let syncedCount = 0;
  let failedCount = 0;

  for (const action of queue) {
    try {
      await executeAction(action, syncHandlers);
      syncedCount += 1;
    } catch (error) {
      if (error instanceof ApiClientError && error.status >= 400 && error.status < 500) {
        failedCount += 1;
        continue;
      }

      retryQueue.push({
        ...action,
        attempts: action.attempts + 1,
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

