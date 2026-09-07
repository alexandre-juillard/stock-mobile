import AsyncStorage from '@react-native-async-storage/async-storage';

import { ApiClientError } from '@/services/api/http-client';

const SHOPPING_LIST_ACTIONS_QUEUE_KEY = 'offline.shopping-list.actions.v1';

interface PendingShoppingListActionBase {
  actionId: string;
  type:
    | 'add_item'
    | 'check_item'
    | 'uncheck_item'
    | 'delete_item'
    | 'clear_list'
    | 'finish_list'
    | 'check_thresholds';
  queuedAt: string;
  attempts: number;
  lastErrorMessage?: string;
}

interface PendingAddItemAction extends PendingShoppingListActionBase {
  type: 'add_item';
  payload: {
    productId: string;
  };
}

interface PendingCheckItemAction extends PendingShoppingListActionBase {
  type: 'check_item';
  payload: {
    itemId: string;
    checkedQuantity: number;
    checkedUnitId: string;
  };
}

interface PendingUncheckItemAction extends PendingShoppingListActionBase {
  type: 'uncheck_item';
  payload: {
    itemId: string;
  };
}

interface PendingDeleteItemAction extends PendingShoppingListActionBase {
  type: 'delete_item';
  payload: {
    itemId: string;
  };
}

interface PendingClearListAction extends PendingShoppingListActionBase {
  type: 'clear_list';
}

interface PendingFinishListAction extends PendingShoppingListActionBase {
  type: 'finish_list';
}

interface PendingCheckThresholdsAction extends PendingShoppingListActionBase {
  type: 'check_thresholds';
}

type PendingShoppingListAction =
  | PendingAddItemAction
  | PendingCheckItemAction
  | PendingUncheckItemAction
  | PendingDeleteItemAction
  | PendingClearListAction
  | PendingFinishListAction
  | PendingCheckThresholdsAction;

export type EnqueuePendingShoppingListActionInput =
  | {
      type: 'add_item';
      payload: {
        productId: string;
      };
    }
  | {
      type: 'check_item';
      payload: {
        itemId: string;
        checkedQuantity: number;
        checkedUnitId: string;
      };
    }
  | {
      type: 'uncheck_item';
      payload: {
        itemId: string;
      };
    }
  | {
      type: 'delete_item';
      payload: {
        itemId: string;
      };
    }
  | {
      type: 'clear_list';
    }
  | {
      type: 'finish_list';
    }
  | {
      type: 'check_thresholds';
    };

interface ShoppingListActionSyncHandlers {
  addItem: (payload: { productId: string }) => Promise<void>;
  checkItem: (payload: { itemId: string; checkedQuantity: number; checkedUnitId: string }) => Promise<void>;
  uncheckItem: (payload: { itemId: string }) => Promise<void>;
  deleteItem: (payload: { itemId: string }) => Promise<void>;
  clearList: () => Promise<void>;
  finishList: () => Promise<void>;
  checkThresholds: () => Promise<void>;
}

export interface FlushPendingShoppingListActionsResult {
  status: 'none' | 'synced' | 'retry_later' | 'failed';
  syncedCount: number;
  retryCount: number;
  failedCount: number;
}

function createActionId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function toPendingAction(input: EnqueuePendingShoppingListActionInput): PendingShoppingListAction {
  const baseAction: PendingShoppingListActionBase = {
    actionId: createActionId(),
    type: input.type,
    queuedAt: new Date().toISOString(),
    attempts: 0,
  };

  if (input.type === 'add_item') {
    return {
      ...baseAction,
      type: 'add_item',
      payload: input.payload,
    };
  }

  if (input.type === 'check_item') {
    return {
      ...baseAction,
      type: 'check_item',
      payload: input.payload,
    };
  }

  if (input.type === 'uncheck_item') {
    return {
      ...baseAction,
      type: 'uncheck_item',
      payload: input.payload,
    };
  }

  if (input.type === 'delete_item') {
    return {
      ...baseAction,
      type: 'delete_item',
      payload: input.payload,
    };
  }

  if (input.type === 'clear_list') {
    return {
      ...baseAction,
      type: 'clear_list',
    };
  }

  if (input.type === 'finish_list') {
    return {
      ...baseAction,
      type: 'finish_list',
    };
  }

  return {
    ...baseAction,
    type: 'check_thresholds',
  };
}

async function readQueue(): Promise<PendingShoppingListAction[]> {
  const rawValue = await AsyncStorage.getItem(SHOPPING_LIST_ACTIONS_QUEUE_KEY);
  if (!rawValue) {
    return [];
  }

  try {
    const parsedValue = JSON.parse(rawValue);
    if (!Array.isArray(parsedValue)) {
      await AsyncStorage.removeItem(SHOPPING_LIST_ACTIONS_QUEUE_KEY);
      return [];
    }

    return parsedValue as PendingShoppingListAction[];
  } catch {
    await AsyncStorage.removeItem(SHOPPING_LIST_ACTIONS_QUEUE_KEY);
    return [];
  }
}

async function writeQueue(queue: PendingShoppingListAction[]): Promise<void> {
  if (queue.length === 0) {
    await AsyncStorage.removeItem(SHOPPING_LIST_ACTIONS_QUEUE_KEY);
    return;
  }

  await AsyncStorage.setItem(SHOPPING_LIST_ACTIONS_QUEUE_KEY, JSON.stringify(queue));
}

async function executeAction(
  action: PendingShoppingListAction,
  syncHandlers: ShoppingListActionSyncHandlers
): Promise<void> {
  if (action.type === 'add_item') {
    await syncHandlers.addItem(action.payload);
    return;
  }

  if (action.type === 'check_item') {
    await syncHandlers.checkItem(action.payload);
    return;
  }

  if (action.type === 'uncheck_item') {
    await syncHandlers.uncheckItem(action.payload);
    return;
  }

  if (action.type === 'delete_item') {
    await syncHandlers.deleteItem(action.payload);
    return;
  }

  if (action.type === 'clear_list') {
    await syncHandlers.clearList();
    return;
  }

  if (action.type === 'finish_list') {
    await syncHandlers.finishList();
    return;
  }

  await syncHandlers.checkThresholds();
}

export async function enqueuePendingShoppingListAction(
  input: EnqueuePendingShoppingListActionInput
): Promise<void> {
  const queue = await readQueue();
  queue.push(toPendingAction(input));
  await writeQueue(queue);
}

export async function getPendingShoppingListActionsCount(): Promise<number> {
  const queue = await readQueue();
  return queue.length;
}

export async function flushPendingShoppingListActions(
  syncHandlers: ShoppingListActionSyncHandlers
): Promise<FlushPendingShoppingListActionsResult> {
  const queue = await readQueue();
  if (queue.length === 0) {
    return {
      status: 'none',
      syncedCount: 0,
      retryCount: 0,
      failedCount: 0,
    };
  }

  const retryQueue: PendingShoppingListAction[] = [];
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

