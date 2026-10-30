import {
  createPersistentQueue,
  createQueueEntryId,
  createQueuedEntryMeta,
  type QueueFlushResult,
  type QueuedEntryMeta,
} from '@/services/offline/offline-queue';

interface AddItemPayload {
  productId: string;
}

interface CheckItemPayload {
  itemId: string;
  checkedQuantity: number;
  checkedUnitId: string;
}

interface ItemIdPayload {
  itemId: string;
}

export type EnqueuePendingShoppingListActionInput =
  | {
      type: 'add_item';
      payload: AddItemPayload;
    }
  | {
      type: 'check_item';
      payload: CheckItemPayload;
    }
  | {
      type: 'uncheck_item';
      payload: ItemIdPayload;
    }
  | {
      type: 'delete_item';
      payload: ItemIdPayload;
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

type PendingShoppingListAction = EnqueuePendingShoppingListActionInput &
  QueuedEntryMeta & {
    actionId: string;
  };

interface ShoppingListActionSyncHandlers {
  addItem: (payload: AddItemPayload) => Promise<void>;
  checkItem: (payload: CheckItemPayload) => Promise<void>;
  uncheckItem: (payload: ItemIdPayload) => Promise<void>;
  deleteItem: (payload: ItemIdPayload) => Promise<void>;
  clearList: () => Promise<void>;
  finishList: () => Promise<void>;
  checkThresholds: () => Promise<void>;
}

export type FlushPendingShoppingListActionsResult = QueueFlushResult;

const queue = createPersistentQueue<PendingShoppingListAction>('offline.shopping-list.actions.v1');

async function executeAction(
  action: PendingShoppingListAction,
  syncHandlers: ShoppingListActionSyncHandlers
): Promise<void> {
  switch (action.type) {
    case 'add_item':
      return syncHandlers.addItem(action.payload);
    case 'check_item':
      return syncHandlers.checkItem(action.payload);
    case 'uncheck_item':
      return syncHandlers.uncheckItem(action.payload);
    case 'delete_item':
      return syncHandlers.deleteItem(action.payload);
    case 'clear_list':
      return syncHandlers.clearList();
    case 'finish_list':
      return syncHandlers.finishList();
    case 'check_thresholds':
      return syncHandlers.checkThresholds();
  }
}

export async function enqueuePendingShoppingListAction(
  input: EnqueuePendingShoppingListActionInput
): Promise<void> {
  await queue.append({ ...input, actionId: createQueueEntryId(), ...createQueuedEntryMeta() });
}

export async function getPendingShoppingListActionsCount(): Promise<number> {
  return queue.count();
}

export async function flushPendingShoppingListActions(
  syncHandlers: ShoppingListActionSyncHandlers
): Promise<FlushPendingShoppingListActionsResult> {
  return queue.flush((action) => executeAction(action, syncHandlers));
}
