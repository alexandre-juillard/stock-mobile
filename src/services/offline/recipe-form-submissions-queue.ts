import {
  createPersistentQueue,
  createQueueEntryId,
  createQueuedEntryMeta,
  type QueueFlushResult,
  type QueuedEntryMeta,
} from '@/services/offline/offline-queue';

export interface RecipeFormSubmissionIngredient {
  productId: string;
  unitId: string;
  quantity: number;
}

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

export type PendingRecipeFormSubmission = EnqueuePendingRecipeFormSubmissionInput &
  QueuedEntryMeta & {
    submissionId: string;
  };

export type FlushPendingRecipeFormSubmissionsResult = QueueFlushResult;

const queue = createPersistentQueue<PendingRecipeFormSubmission>(
  'offline.recipes.form-submissions.v1'
);

export async function enqueuePendingRecipeFormSubmission(
  input: EnqueuePendingRecipeFormSubmissionInput
): Promise<void> {
  await queue.append({ ...input, submissionId: createQueueEntryId(), ...createQueuedEntryMeta() });
}

export async function getPendingRecipeFormSubmissionsCount(): Promise<number> {
  return queue.count();
}

export async function flushPendingRecipeFormSubmissions(
  sync: (submission: PendingRecipeFormSubmission) => Promise<void>
): Promise<FlushPendingRecipeFormSubmissionsResult> {
  return queue.flush(sync);
}
