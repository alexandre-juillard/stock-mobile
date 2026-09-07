import AsyncStorage from '@react-native-async-storage/async-storage';

import { ApiClientError } from '@/services/api/http-client';

const STOCK_ITEM_ACTIONS_QUEUE_KEY = 'offline.stock.item-actions.v1';

interface UpdateQuantityPayload {
  quantity: number;
}

type PendingStockItemActionType = 'update_quantity' | 'add_to_shopping_list' | 'consume';

interface PendingStockItemActionBase {
  actionId: string;
  type: PendingStockItemActionType;
  stockItemId: string;
  queuedAt: string;
  attempts: number;
  lastErrorMessage?: string;
}

interface PendingUpdateQuantityAction extends PendingStockItemActionBase {
  type: 'update_quantity';
  payload: UpdateQuantityPayload;
}

interface PendingAddToShoppingListAction extends PendingStockItemActionBase {
  type: 'add_to_shopping_list';
}

interface PendingConsumeAction extends PendingStockItemActionBase {
  type: 'consume';
}

type PendingStockItemAction =
  | PendingUpdateQuantityAction
  | PendingAddToShoppingListAction
  | PendingConsumeAction;

export type EnqueuePendingStockItemActionInput =
  | {
      type: 'update_quantity';
      stockItemId: string;
      payload: UpdateQuantityPayload;
    }
  | {
      type: 'add_to_shopping_list';
      stockItemId: string;
    }
  | {
      type: 'consume';
      stockItemId: string;
    };

interface StockItemActionSyncHandlers {
  updateQuantity: (stockItemId: string, payload: UpdateQuantityPayload) => Promise<void>;
  addToShoppingList: (stockItemId: string) => Promise<void>;
  consume: (stockItemId: string) => Promise<void>;
}

export interface FlushPendingStockItemActionsResult {
  status: 'none' | 'synced' | 'retry_later' | 'failed';
  syncedCount: number;
  retryCount: number;
  failedCount: number;
}

function createActionId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function toPendingAction(input: EnqueuePendingStockItemActionInput): PendingStockItemAction {
  const baseAction: PendingStockItemActionBase = {
    actionId: createActionId(),
    type: input.type,
    stockItemId: input.stockItemId,
    queuedAt: new Date().toISOString(),
    attempts: 0,
  };

  if (input.type === 'update_quantity') {
    return {
      ...baseAction,
      type: 'update_quantity',
      payload: input.payload,
    };
  }

  if (input.type === 'add_to_shopping_list') {
    return {
      ...baseAction,
      type: 'add_to_shopping_list',
    };
  }

  return {
    ...baseAction,
    type: 'consume',
  };
}

async function readQueue(): Promise<PendingStockItemAction[]> {
  const rawValue = await AsyncStorage.getItem(STOCK_ITEM_ACTIONS_QUEUE_KEY);
  if (!rawValue) {
    return [];
  }

  try {
    const parsedValue = JSON.parse(rawValue);
    if (!Array.isArray(parsedValue)) {
      await AsyncStorage.removeItem(STOCK_ITEM_ACTIONS_QUEUE_KEY);
      return [];
    }

    return parsedValue as PendingStockItemAction[];
  } catch {
    await AsyncStorage.removeItem(STOCK_ITEM_ACTIONS_QUEUE_KEY);
    return [];
  }
}

async function writeQueue(queue: PendingStockItemAction[]): Promise<void> {
  if (queue.length === 0) {
    await AsyncStorage.removeItem(STOCK_ITEM_ACTIONS_QUEUE_KEY);
    return;
  }

  await AsyncStorage.setItem(STOCK_ITEM_ACTIONS_QUEUE_KEY, JSON.stringify(queue));
}

async function executeAction(
  action: PendingStockItemAction,
  syncHandlers: StockItemActionSyncHandlers
): Promise<void> {
  if (action.type === 'update_quantity') {
    await syncHandlers.updateQuantity(action.stockItemId, action.payload);
    return;
  }

  if (action.type === 'add_to_shopping_list') {
    await syncHandlers.addToShoppingList(action.stockItemId);
    return;
  }

  await syncHandlers.consume(action.stockItemId);
}

export async function enqueuePendingStockItemAction(
  input: EnqueuePendingStockItemActionInput
): Promise<void> {
  const queue = await readQueue();
  queue.push(toPendingAction(input));
  await writeQueue(queue);
}

export async function getPendingStockItemActionsCount(stockItemId?: string): Promise<number> {
  const queue = await readQueue();

  if (!stockItemId) {
    return queue.length;
  }

  return queue.filter((action) => action.stockItemId === stockItemId).length;
}

export async function flushPendingStockItemActions(
  syncHandlers: StockItemActionSyncHandlers
): Promise<FlushPendingStockItemActionsResult> {
  const queue = await readQueue();
  if (queue.length === 0) {
    return {
      status: 'none',
      syncedCount: 0,
      retryCount: 0,
      failedCount: 0,
    };
  }

  const retryQueue: PendingStockItemAction[] = [];
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

