import AsyncStorage from '@react-native-async-storage/async-storage';

import { ApiClientError } from '@/services/api/http-client';

const STOCK_FORM_SUBMISSIONS_QUEUE_KEY = 'offline.stock.form-submissions.v1';

type StockFormSubmissionMode = 'create' | 'edit';

export interface PendingPhotoSelection {
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
}

interface PendingStockFormSubmissionBase {
  submissionId: string;
  mode: StockFormSubmissionMode;
  productName: string;
  categoryId: string;
  quantity: number;
  lowThreshold?: number;
  expirationDate?: string;
  photo?: PendingPhotoSelection;
  queuedAt: string;
  attempts: number;
  lastErrorMessage?: string;
}

interface PendingCreateStockFormSubmission extends PendingStockFormSubmissionBase {
  mode: 'create';
  quantityTypeId: string;
  baseUnitId: string;
}

interface PendingEditStockFormSubmission extends PendingStockFormSubmissionBase {
  mode: 'edit';
  stockItemId: string;
  productId: string;
  quantityTypeId?: string;
  baseUnitId?: string;
}

export type PendingStockFormSubmission =
  | PendingCreateStockFormSubmission
  | PendingEditStockFormSubmission;

export type EnqueuePendingStockFormSubmissionInput =
  | {
      mode: 'create';
      productName: string;
      categoryId: string;
      quantityTypeId: string;
      baseUnitId: string;
      quantity: number;
      lowThreshold?: number;
      expirationDate?: string;
      photo?: PendingPhotoSelection;
    }
  | {
      mode: 'edit';
      stockItemId: string;
      productId: string;
      productName: string;
      categoryId: string;
      quantity: number;
      lowThreshold?: number;
      expirationDate?: string;
      photo?: PendingPhotoSelection;
      quantityTypeId?: string;
      baseUnitId?: string;
    };

export interface FlushPendingStockFormSubmissionsResult {
  status: 'none' | 'synced' | 'retry_later' | 'failed';
  syncedCount: number;
  retryCount: number;
  failedCount: number;
}

function createSubmissionId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function toPendingSubmission(
  input: EnqueuePendingStockFormSubmissionInput
): PendingStockFormSubmission {
  const baseSubmission: PendingStockFormSubmissionBase = {
    submissionId: createSubmissionId(),
    mode: input.mode,
    productName: input.productName,
    categoryId: input.categoryId,
    quantity: input.quantity,
    lowThreshold: input.lowThreshold,
    expirationDate: input.expirationDate,
    photo: input.photo,
    queuedAt: new Date().toISOString(),
    attempts: 0,
  };

  if (input.mode === 'create') {
    return {
      ...baseSubmission,
      mode: 'create',
      quantityTypeId: input.quantityTypeId,
      baseUnitId: input.baseUnitId,
    };
  }

  return {
    ...baseSubmission,
    mode: 'edit',
    stockItemId: input.stockItemId,
    productId: input.productId,
    quantityTypeId: input.quantityTypeId,
    baseUnitId: input.baseUnitId,
  };
}

async function readQueue(): Promise<PendingStockFormSubmission[]> {
  const rawValue = await AsyncStorage.getItem(STOCK_FORM_SUBMISSIONS_QUEUE_KEY);
  if (!rawValue) {
    return [];
  }

  try {
    const parsedValue = JSON.parse(rawValue);
    if (!Array.isArray(parsedValue)) {
      await AsyncStorage.removeItem(STOCK_FORM_SUBMISSIONS_QUEUE_KEY);
      return [];
    }

    return parsedValue as PendingStockFormSubmission[];
  } catch {
    await AsyncStorage.removeItem(STOCK_FORM_SUBMISSIONS_QUEUE_KEY);
    return [];
  }
}

async function writeQueue(queue: PendingStockFormSubmission[]): Promise<void> {
  if (queue.length === 0) {
    await AsyncStorage.removeItem(STOCK_FORM_SUBMISSIONS_QUEUE_KEY);
    return;
  }

  await AsyncStorage.setItem(STOCK_FORM_SUBMISSIONS_QUEUE_KEY, JSON.stringify(queue));
}

export async function enqueuePendingStockFormSubmission(
  input: EnqueuePendingStockFormSubmissionInput
): Promise<void> {
  const queue = await readQueue();
  queue.push(toPendingSubmission(input));
  await writeQueue(queue);
}

export async function getPendingStockFormSubmissionsCount(): Promise<number> {
  const queue = await readQueue();
  return queue.length;
}

export async function flushPendingStockFormSubmissions(
  sync: (submission: PendingStockFormSubmission) => Promise<void>
): Promise<FlushPendingStockFormSubmissionsResult> {
  const queue = await readQueue();
  if (queue.length === 0) {
    return {
      status: 'none',
      syncedCount: 0,
      retryCount: 0,
      failedCount: 0,
    };
  }

  const retryQueue: PendingStockFormSubmission[] = [];
  let syncedCount = 0;
  let failedCount = 0;

  for (const submission of queue) {
    try {
      await sync(submission);
      syncedCount += 1;
    } catch (error) {
      if (error instanceof ApiClientError && error.status >= 400 && error.status < 500) {
        failedCount += 1;
        continue;
      }

      retryQueue.push({
        ...submission,
        attempts: submission.attempts + 1,
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


