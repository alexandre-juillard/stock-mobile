import AsyncStorage from '@react-native-async-storage/async-storage';

import { ApiClientError } from '@/services/api/http-client';

const CATEGORIES_QUEUE_KEY = 'offline.categories.actions.v1';

interface CategoryPayload {
  name: string;
  color: string;
}

type PendingCategoryActionType = 'create' | 'update' | 'delete';

interface PendingCategoryActionBase {
  actionId: string;
  type: PendingCategoryActionType;
  queuedAt: string;
  attempts: number;
  lastErrorMessage?: string;
}

interface PendingCreateCategoryAction extends PendingCategoryActionBase {
  type: 'create';
  payload: CategoryPayload;
}

interface PendingUpdateCategoryAction extends PendingCategoryActionBase {
  type: 'update';
  categoryId: string;
  payload: CategoryPayload;
}

interface PendingDeleteCategoryAction extends PendingCategoryActionBase {
  type: 'delete';
  categoryId: string;
}

type PendingCategoryAction =
  | PendingCreateCategoryAction
  | PendingUpdateCategoryAction
  | PendingDeleteCategoryAction;

export type EnqueuePendingCategoryActionInput =
  | {
      type: 'create';
      payload: CategoryPayload;
    }
  | {
      type: 'update';
      categoryId: string;
      payload: CategoryPayload;
    }
  | {
      type: 'delete';
      categoryId: string;
    };

interface CategoryActionSyncHandlers {
  create: (payload: CategoryPayload) => Promise<void>;
  update: (categoryId: string, payload: CategoryPayload) => Promise<void>;
  delete: (categoryId: string) => Promise<void>;
}

export interface FlushPendingCategoryActionsResult {
  status: 'none' | 'synced' | 'retry_later' | 'failed';
  syncedCount: number;
  retryCount: number;
  failedCount: number;
}

function createActionId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function toPendingCategoryAction(input: EnqueuePendingCategoryActionInput): PendingCategoryAction {
  const baseAction: PendingCategoryActionBase = {
    actionId: createActionId(),
    type: input.type,
    queuedAt: new Date().toISOString(),
    attempts: 0,
  };

  if (input.type === 'create') {
    return {
      ...baseAction,
      type: 'create',
      payload: input.payload,
    };
  }

  if (input.type === 'update') {
    return {
      ...baseAction,
      type: 'update',
      categoryId: input.categoryId,
      payload: input.payload,
    };
  }

  return {
    ...baseAction,
    type: 'delete',
    categoryId: input.categoryId,
  };
}

async function readQueue(): Promise<PendingCategoryAction[]> {
  const rawValue = await AsyncStorage.getItem(CATEGORIES_QUEUE_KEY);
  if (!rawValue) {
    return [];
  }

  try {
    const parsedValue = JSON.parse(rawValue);
    if (!Array.isArray(parsedValue)) {
      await AsyncStorage.removeItem(CATEGORIES_QUEUE_KEY);
      return [];
    }

    return parsedValue as PendingCategoryAction[];
  } catch {
    await AsyncStorage.removeItem(CATEGORIES_QUEUE_KEY);
    return [];
  }
}

async function writeQueue(queue: PendingCategoryAction[]): Promise<void> {
  if (queue.length === 0) {
    await AsyncStorage.removeItem(CATEGORIES_QUEUE_KEY);
    return;
  }

  await AsyncStorage.setItem(CATEGORIES_QUEUE_KEY, JSON.stringify(queue));
}

async function executeAction(
  action: PendingCategoryAction,
  syncHandlers: CategoryActionSyncHandlers
): Promise<void> {
  if (action.type === 'create') {
    await syncHandlers.create(action.payload);
    return;
  }

  if (action.type === 'update') {
    await syncHandlers.update(action.categoryId, action.payload);
    return;
  }

  await syncHandlers.delete(action.categoryId);
}

export async function enqueuePendingCategoryAction(
  input: EnqueuePendingCategoryActionInput
): Promise<void> {
  const queue = await readQueue();
  queue.push(toPendingCategoryAction(input));
  await writeQueue(queue);
}

export async function getPendingCategoryActionsCount(): Promise<number> {
  const queue = await readQueue();
  return queue.length;
}

export async function flushPendingCategoryActions(
  syncHandlers: CategoryActionSyncHandlers
): Promise<FlushPendingCategoryActionsResult> {
  const queue = await readQueue();
  if (queue.length === 0) {
    return {
      status: 'none',
      syncedCount: 0,
      retryCount: 0,
      failedCount: 0,
    };
  }

  const retryQueue: PendingCategoryAction[] = [];
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

