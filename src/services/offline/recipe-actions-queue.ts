import { ApiClientError } from '@/services/api/http-client';
import {
  createListStorage,
  createPersistentQueue,
  createQueueEntryId,
  createQueuedEntryMeta,
  type QueueFlushResult,
  type QueuedEntryMeta,
} from '@/services/offline/offline-queue';

interface PendingConsumeRecipeAction extends QueuedEntryMeta {
  actionId: string;
  type: 'consume';
  recipeId: string;
  force: boolean;
}

interface PendingDeleteRecipeAction extends QueuedEntryMeta {
  actionId: string;
  type: 'delete';
  recipeId: string;
}

type PendingRecipeAction = PendingConsumeRecipeAction | PendingDeleteRecipeAction;

export type EnqueuePendingRecipeActionInput =
  | {
      type: 'consume';
      recipeId: string;
      force?: boolean;
    }
  | {
      type: 'delete';
      recipeId: string;
    };

export interface RecipeConsumeConflictMissingItem {
  productId: string;
  name: string;
}

export interface RecipeConsumeConflictInsufficientItem {
  productId: string;
  name: string;
  required: number;
  available: number;
}

export interface RecipeConsumeConflict {
  missing: RecipeConsumeConflictMissingItem[];
  insufficient: RecipeConsumeConflictInsufficientItem[];
}

export interface RecipeReplayConflictRecord {
  conflictId: string;
  actionId: string;
  recipeId: string;
  conflict: RecipeConsumeConflict;
  recordedAt: string;
}

interface RecipeActionSyncHandlers {
  consume: (recipeId: string, force: boolean) => Promise<void>;
  delete: (recipeId: string) => Promise<void>;
}

export interface FlushPendingRecipeActionsResult extends Omit<QueueFlushResult, 'status'> {
  status: QueueFlushResult['status'] | 'business_conflict';
  conflictCount: number;
}

const actionsQueue = createPersistentQueue<PendingRecipeAction>('offline.recipes.actions.v1');
const replayConflictsStorage = createListStorage<RecipeReplayConflictRecord>(
  'offline.recipes.replay-conflicts.v1'
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toStringValue(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

function toNumberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsedValue = Number.parseFloat(value);
    if (Number.isFinite(parsedValue)) {
      return parsedValue;
    }
  }

  return null;
}

function normalizeMissingItems(value: unknown): RecipeConsumeConflictMissingItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const items: RecipeConsumeConflictMissingItem[] = [];

  for (const entry of value) {
    if (!isRecord(entry)) {
      continue;
    }

    const productId = toStringValue(entry.productId);
    const name = toStringValue(entry.name);

    if (!productId || !name) {
      continue;
    }

    items.push({
      productId,
      name,
    });
  }

  return items;
}

function normalizeInsufficientItems(value: unknown): RecipeConsumeConflictInsufficientItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const items: RecipeConsumeConflictInsufficientItem[] = [];

  for (const entry of value) {
    if (!isRecord(entry)) {
      continue;
    }

    const productId = toStringValue(entry.productId);
    const name = toStringValue(entry.name);
    const required = toNumberValue(entry.required);
    const available = toNumberValue(entry.available);

    if (!productId || !name || required === null || available === null) {
      continue;
    }

    items.push({
      productId,
      name,
      required,
      available,
    });
  }

  return items;
}

export function parseRecipeConsumeConflict(value: unknown): RecipeConsumeConflict | null {
  if (!isRecord(value)) {
    return null;
  }

  const missing = normalizeMissingItems(value.missing);
  const insufficient = normalizeInsufficientItems(value.insufficient);

  if (missing.length === 0 && insufficient.length === 0) {
    return null;
  }

  return { missing, insufficient };
}

export function extractRecipeConsumeConflictFromError(error: unknown): RecipeConsumeConflict | null {
  if (!(error instanceof ApiClientError) || error.status !== 409) {
    return null;
  }

  return parseRecipeConsumeConflict(error.details);
}

function toPendingRecipeAction(input: EnqueuePendingRecipeActionInput): PendingRecipeAction {
  const baseAction = {
    actionId: createQueueEntryId(),
    ...createQueuedEntryMeta(),
  };

  if (input.type === 'consume') {
    return {
      ...baseAction,
      type: 'consume',
      recipeId: input.recipeId,
      force: Boolean(input.force),
    };
  }

  return {
    ...baseAction,
    type: 'delete',
    recipeId: input.recipeId,
  };
}

async function appendReplayConflicts(conflictsToAdd: RecipeReplayConflictRecord[]): Promise<void> {
  if (conflictsToAdd.length === 0) {
    return;
  }

  const existingConflicts = await replayConflictsStorage.read();
  await replayConflictsStorage.write([...conflictsToAdd, ...existingConflicts]);
}

async function executeRecipeAction(
  action: PendingRecipeAction,
  syncHandlers: RecipeActionSyncHandlers
): Promise<void> {
  if (action.type === 'consume') {
    await syncHandlers.consume(action.recipeId, action.force);
    return;
  }

  await syncHandlers.delete(action.recipeId);
}

export async function enqueuePendingRecipeAction(
  input: EnqueuePendingRecipeActionInput
): Promise<void> {
  await actionsQueue.append(toPendingRecipeAction(input));
}

export async function getPendingRecipeActionsCount(recipeId?: string): Promise<number> {
  return actionsQueue.count(recipeId ? (action) => action.recipeId === recipeId : undefined);
}

export async function listRecipeReplayConflicts(recipeId?: string): Promise<RecipeReplayConflictRecord[]> {
  const conflicts = await replayConflictsStorage.read();

  if (!recipeId) {
    return conflicts;
  }

  return conflicts.filter((conflict) => conflict.recipeId === recipeId);
}

export async function clearRecipeReplayConflicts(recipeId?: string): Promise<void> {
  if (!recipeId) {
    await replayConflictsStorage.clear();
    return;
  }

  const conflicts = await replayConflictsStorage.read();
  await replayConflictsStorage.write(conflicts.filter((conflict) => conflict.recipeId !== recipeId));
}

export async function flushPendingRecipeActions(
  syncHandlers: RecipeActionSyncHandlers
): Promise<FlushPendingRecipeActionsResult> {
  const replayConflicts: RecipeReplayConflictRecord[] = [];

  const result = await actionsQueue.flush(async (action) => {
    try {
      await executeRecipeAction(action, syncHandlers);
    } catch (error) {
      // Un conflit 409 est une erreur 4xx : l'action est abandonnée par la file,
      // mais on conserve le détail pour l'afficher à l'utilisateur.
      const conflict = action.type === 'consume' ? extractRecipeConsumeConflictFromError(error) : null;
      if (conflict) {
        replayConflicts.push({
          conflictId: createQueueEntryId(),
          actionId: action.actionId,
          recipeId: action.recipeId,
          conflict,
          recordedAt: new Date().toISOString(),
        });
      }

      throw error;
    }
  });

  await appendReplayConflicts(replayConflicts);

  const conflictCount = replayConflicts.length;
  if (result.status === 'failed' && conflictCount > 0) {
    return { ...result, status: 'business_conflict', conflictCount };
  }

  return { ...result, conflictCount };
}
