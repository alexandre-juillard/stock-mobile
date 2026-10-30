import {
  createPersistentQueue,
  createQueueEntryId,
  createQueuedEntryMeta,
  type QueueFlushResult,
  type QueuedEntryMeta,
} from '@/services/offline/offline-queue';

export interface PendingPhotoSelection {
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
}

interface StockFormSubmissionFields {
  productName: string;
  categoryId: string;
  quantity: number;
  lowThreshold?: number;
  expirationDate?: string;
  photo?: PendingPhotoSelection;
}

export type EnqueuePendingStockFormSubmissionInput =
  | (StockFormSubmissionFields & {
      mode: 'create';
      quantityTypeId: string;
      baseUnitId: string;
    })
  | (StockFormSubmissionFields & {
      mode: 'edit';
      stockItemId: string;
      productId: string;
      quantityTypeId?: string;
      baseUnitId?: string;
    });

export type PendingStockFormSubmission = EnqueuePendingStockFormSubmissionInput &
  QueuedEntryMeta & {
    submissionId: string;
  };

export type FlushPendingStockFormSubmissionsResult = QueueFlushResult;

const queue = createPersistentQueue<PendingStockFormSubmission>('offline.stock.form-submissions.v1');

export async function enqueuePendingStockFormSubmission(
  input: EnqueuePendingStockFormSubmissionInput
): Promise<void> {
  await queue.append({ ...input, submissionId: createQueueEntryId(), ...createQueuedEntryMeta() });
}

export async function getPendingStockFormSubmissionsCount(): Promise<number> {
  return queue.count();
}

export async function flushPendingStockFormSubmissions(
  sync: (submission: PendingStockFormSubmission) => Promise<void>
): Promise<FlushPendingStockFormSubmissionsResult> {
  return queue.flush(sync);
}
