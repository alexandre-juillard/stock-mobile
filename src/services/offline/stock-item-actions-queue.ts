import {
  createPersistentQueue,
  createQueueEntryId,
  createQueuedEntryMeta,
  type QueueFlushResult,
  type QueuedEntryMeta,
} from '@/services/offline/offline-queue';

interface UpdateQuantityPayload {
  quantity: number;
}

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

type PendingStockItemAction = EnqueuePendingStockItemActionInput &
  QueuedEntryMeta & {
    actionId: string;
  };

interface StockItemActionSyncHandlers {
  updateQuantity: (stockItemId: string, payload: UpdateQuantityPayload) => Promise<void>;
  addToShoppingList: (stockItemId: string) => Promise<void>;
  consume: (stockItemId: string) => Promise<void>;
}

export type FlushPendingStockItemActionsResult = QueueFlushResult;

const queue = createPersistentQueue<PendingStockItemAction>('offline.stock.item-actions.v1');

async function executeAction(
  action: PendingStockItemAction,
  syncHandlers: StockItemActionSyncHandlers
): Promise<void> {
  switch (action.type) {
    case 'update_quantity':
      return syncHandlers.updateQuantity(action.stockItemId, action.payload);
    case 'add_to_shopping_list':
      return syncHandlers.addToShoppingList(action.stockItemId);
    case 'consume':
      return syncHandlers.consume(action.stockItemId);
  }
}

export async function enqueuePendingStockItemAction(
  input: EnqueuePendingStockItemActionInput
): Promise<void> {
  await queue.append({ ...input, actionId: createQueueEntryId(), ...createQueuedEntryMeta() });
}

export async function getPendingStockItemActionsCount(stockItemId?: string): Promise<number> {
  return queue.count(stockItemId ? (action) => action.stockItemId === stockItemId : undefined);
}

export async function flushPendingStockItemActions(
  syncHandlers: StockItemActionSyncHandlers
): Promise<FlushPendingStockItemActionsResult> {
  return queue.flush((action) => executeAction(action, syncHandlers));
}
