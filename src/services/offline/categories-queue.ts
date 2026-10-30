import {
  createPersistentQueue,
  createQueueEntryId,
  createQueuedEntryMeta,
  type QueueFlushResult,
  type QueuedEntryMeta,
} from '@/services/offline/offline-queue';

interface CategoryPayload {
  name: string;
  color: string;
}

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

type PendingCategoryAction = EnqueuePendingCategoryActionInput &
  QueuedEntryMeta & {
    actionId: string;
  };

interface CategoryActionSyncHandlers {
  create: (payload: CategoryPayload) => Promise<void>;
  update: (categoryId: string, payload: CategoryPayload) => Promise<void>;
  delete: (categoryId: string) => Promise<void>;
}

export type FlushPendingCategoryActionsResult = QueueFlushResult;

const queue = createPersistentQueue<PendingCategoryAction>('offline.categories.actions.v1');

async function executeAction(
  action: PendingCategoryAction,
  syncHandlers: CategoryActionSyncHandlers
): Promise<void> {
  switch (action.type) {
    case 'create':
      return syncHandlers.create(action.payload);
    case 'update':
      return syncHandlers.update(action.categoryId, action.payload);
    case 'delete':
      return syncHandlers.delete(action.categoryId);
  }
}

export async function enqueuePendingCategoryAction(
  input: EnqueuePendingCategoryActionInput
): Promise<void> {
  await queue.append({ ...input, actionId: createQueueEntryId(), ...createQueuedEntryMeta() });
}

export async function getPendingCategoryActionsCount(): Promise<number> {
  return queue.count();
}

export async function flushPendingCategoryActions(
  syncHandlers: CategoryActionSyncHandlers
): Promise<FlushPendingCategoryActionsResult> {
  return queue.flush((action) => executeAction(action, syncHandlers));
}
