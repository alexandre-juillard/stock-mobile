import AsyncStorage from '@react-native-async-storage/async-storage';

import { ApiClientError } from '@/services/api/http-client';

const RECIPE_FORM_SUBMISSIONS_QUEUE_KEY = 'offline.recipes.form-submissions.v1';

export interface RecipeFormSubmissionIngredient {
  productId: string;
  unitId: string;
  quantity: number;
}

interface PendingRecipeFormSubmissionBase {
  submissionId: string;
  mode: 'create' | 'edit';
  name: string;
  ingredients: RecipeFormSubmissionIngredient[];
  queuedAt: string;
  attempts: number;
  lastErrorMessage?: string;
}

interface PendingCreateRecipeFormSubmission extends PendingRecipeFormSubmissionBase {
  mode: 'create';
}

interface PendingEditRecipeFormSubmission extends PendingRecipeFormSubmissionBase {
  mode: 'edit';
  recipeId: string;
}

export type PendingRecipeFormSubmission =
  | PendingCreateRecipeFormSubmission
  | PendingEditRecipeFormSubmission;

export type EnqueuePendingRecipeFormSubmissionInput =
  | {
      mode: 'create';
      name: string;
      ingredients: RecipeFormSubmissionIngredient[];
    }
  | {
      mode: 'edit';
      recipeId: string;
      name: string;
      ingredients: RecipeFormSubmissionIngredient[];
    };

export interface FlushPendingRecipeFormSubmissionsResult {
  status: 'none' | 'synced' | 'retry_later' | 'failed';
  syncedCount: number;
  retryCount: number;
  failedCount: number;
}

function createSubmissionId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function toPendingSubmission(
  input: EnqueuePendingRecipeFormSubmissionInput
): PendingRecipeFormSubmission {
  const baseSubmission: PendingRecipeFormSubmissionBase = {
    submissionId: createSubmissionId(),
    mode: input.mode,
    name: input.name,
    ingredients: input.ingredients,
    queuedAt: new Date().toISOString(),
    attempts: 0,
  };

  if (input.mode === 'create') {
    return {
      ...baseSubmission,
      mode: 'create',
    };
  }

  return {
    ...baseSubmission,
    mode: 'edit',
    recipeId: input.recipeId,
  };
}

async function readQueue(): Promise<PendingRecipeFormSubmission[]> {
  const rawValue = await AsyncStorage.getItem(RECIPE_FORM_SUBMISSIONS_QUEUE_KEY);
  if (!rawValue) {
    return [];
  }

  try {
    const parsedValue = JSON.parse(rawValue);
    if (!Array.isArray(parsedValue)) {
      await AsyncStorage.removeItem(RECIPE_FORM_SUBMISSIONS_QUEUE_KEY);
      return [];
    }

    return parsedValue as PendingRecipeFormSubmission[];
  } catch {
    await AsyncStorage.removeItem(RECIPE_FORM_SUBMISSIONS_QUEUE_KEY);
    return [];
  }
}

async function writeQueue(queue: PendingRecipeFormSubmission[]): Promise<void> {
  if (queue.length === 0) {
    await AsyncStorage.removeItem(RECIPE_FORM_SUBMISSIONS_QUEUE_KEY);
    return;
  }

  await AsyncStorage.setItem(RECIPE_FORM_SUBMISSIONS_QUEUE_KEY, JSON.stringify(queue));
}

export async function enqueuePendingRecipeFormSubmission(
  input: EnqueuePendingRecipeFormSubmissionInput
): Promise<void> {
  const queue = await readQueue();
  queue.push(toPendingSubmission(input));
  await writeQueue(queue);
}

export async function getPendingRecipeFormSubmissionsCount(): Promise<number> {
  const queue = await readQueue();
  return queue.length;
}

export async function flushPendingRecipeFormSubmissions(
  sync: (submission: PendingRecipeFormSubmission) => Promise<void>
): Promise<FlushPendingRecipeFormSubmissionsResult> {
  const queue = await readQueue();
  if (queue.length === 0) {
    return {
      status: 'none',
      syncedCount: 0,
      retryCount: 0,
      failedCount: 0,
    };
  }

  const retryQueue: PendingRecipeFormSubmission[] = [];
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

