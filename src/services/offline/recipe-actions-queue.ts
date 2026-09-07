import AsyncStorage from '@react-native-async-storage/async-storage';

import { ApiClientError } from '@/services/api/http-client';

const RECIPE_ACTIONS_QUEUE_KEY = 'offline.recipes.actions.v1';
const RECIPE_REPLAY_CONFLICTS_KEY = 'offline.recipes.replay-conflicts.v1';

interface PendingRecipeActionBase {
  actionId: string;
  queuedAt: string;
  attempts: number;
  lastErrorMessage?: string;
}

interface PendingConsumeRecipeAction extends PendingRecipeActionBase {
  type: 'consume';
  recipeId: string;
  force: boolean;
}

interface PendingDeleteRecipeAction extends PendingRecipeActionBase {
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

export interface FlushPendingRecipeActionsResult {
  status: 'none' | 'synced' | 'retry_later' | 'failed' | 'business_conflict';
  syncedCount: number;
  retryCount: number;
  failedCount: number;
  conflictCount: number;
}

function createId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

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
  const baseAction: PendingRecipeActionBase = {
    actionId: createId(),
    queuedAt: new Date().toISOString(),
    attempts: 0,
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

async function readActionsQueue(): Promise<PendingRecipeAction[]> {
  const rawValue = await AsyncStorage.getItem(RECIPE_ACTIONS_QUEUE_KEY);
  if (!rawValue) {
    return [];
  }

  try {
    const parsedValue = JSON.parse(rawValue);
    if (!Array.isArray(parsedValue)) {
      await AsyncStorage.removeItem(RECIPE_ACTIONS_QUEUE_KEY);
      return [];
    }

    return parsedValue as PendingRecipeAction[];
  } catch {
    await AsyncStorage.removeItem(RECIPE_ACTIONS_QUEUE_KEY);
    return [];
  }
}

async function writeActionsQueue(queue: PendingRecipeAction[]): Promise<void> {
  if (queue.length === 0) {
    await AsyncStorage.removeItem(RECIPE_ACTIONS_QUEUE_KEY);
    return;
  }

  await AsyncStorage.setItem(RECIPE_ACTIONS_QUEUE_KEY, JSON.stringify(queue));
}

async function readReplayConflicts(): Promise<RecipeReplayConflictRecord[]> {
  const rawValue = await AsyncStorage.getItem(RECIPE_REPLAY_CONFLICTS_KEY);
  if (!rawValue) {
    return [];
  }

  try {
    const parsedValue = JSON.parse(rawValue);
    if (!Array.isArray(parsedValue)) {
      await AsyncStorage.removeItem(RECIPE_REPLAY_CONFLICTS_KEY);
      return [];
    }

    return parsedValue as RecipeReplayConflictRecord[];
  } catch {
    await AsyncStorage.removeItem(RECIPE_REPLAY_CONFLICTS_KEY);
    return [];
  }
}

async function writeReplayConflicts(conflicts: RecipeReplayConflictRecord[]): Promise<void> {
  if (conflicts.length === 0) {
    await AsyncStorage.removeItem(RECIPE_REPLAY_CONFLICTS_KEY);
    return;
  }

  await AsyncStorage.setItem(RECIPE_REPLAY_CONFLICTS_KEY, JSON.stringify(conflicts));
}

async function appendReplayConflicts(conflictsToAdd: RecipeReplayConflictRecord[]): Promise<void> {
  if (conflictsToAdd.length === 0) {
    return;
  }

  const existingConflicts = await readReplayConflicts();
  const nextConflicts = [...conflictsToAdd, ...existingConflicts];
  await writeReplayConflicts(nextConflicts);
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
  const queue = await readActionsQueue();
  queue.push(toPendingRecipeAction(input));
  await writeActionsQueue(queue);
}

export async function getPendingRecipeActionsCount(recipeId?: string): Promise<number> {
  const queue = await readActionsQueue();

  if (!recipeId) {
    return queue.length;
  }

  return queue.filter((action) => action.recipeId === recipeId).length;
}

export async function listRecipeReplayConflicts(recipeId?: string): Promise<RecipeReplayConflictRecord[]> {
  const conflicts = await readReplayConflicts();

  if (!recipeId) {
    return conflicts;
  }

  return conflicts.filter((conflict) => conflict.recipeId === recipeId);
}

export async function clearRecipeReplayConflicts(recipeId?: string): Promise<void> {
  if (!recipeId) {
    await AsyncStorage.removeItem(RECIPE_REPLAY_CONFLICTS_KEY);
    return;
  }

  const conflicts = await readReplayConflicts();
  const nextConflicts = conflicts.filter((conflict) => conflict.recipeId !== recipeId);
  await writeReplayConflicts(nextConflicts);
}

export async function flushPendingRecipeActions(
  syncHandlers: RecipeActionSyncHandlers
): Promise<FlushPendingRecipeActionsResult> {
  const queue = await readActionsQueue();
  if (queue.length === 0) {
    return {
      status: 'none',
      syncedCount: 0,
      retryCount: 0,
      failedCount: 0,
      conflictCount: 0,
    };
  }

  const retryQueue: PendingRecipeAction[] = [];
  const replayConflicts: RecipeReplayConflictRecord[] = [];
  let syncedCount = 0;
  let failedCount = 0;

  for (const action of queue) {
    try {
      await executeRecipeAction(action, syncHandlers);
      syncedCount += 1;
    } catch (error) {
      if (action.type === 'consume') {
        const conflict = extractRecipeConsumeConflictFromError(error);
        if (conflict) {
          replayConflicts.push({
            conflictId: createId(),
            actionId: action.actionId,
            recipeId: action.recipeId,
            conflict,
            recordedAt: new Date().toISOString(),
          });
          failedCount += 1;
          continue;
        }
      }

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

  await writeActionsQueue(retryQueue);
  await appendReplayConflicts(replayConflicts);

  if (retryQueue.length > 0) {
    return {
      status: 'retry_later',
      syncedCount,
      retryCount: retryQueue.length,
      failedCount,
      conflictCount: replayConflicts.length,
    };
  }

  if (replayConflicts.length > 0) {
    return {
      status: 'business_conflict',
      syncedCount,
      retryCount: 0,
      failedCount,
      conflictCount: replayConflicts.length,
    };
  }

  if (failedCount > 0) {
    return {
      status: 'failed',
      syncedCount,
      retryCount: 0,
      failedCount,
      conflictCount: 0,
    };
  }

  return {
    status: 'synced',
    syncedCount,
    retryCount: 0,
    failedCount: 0,
    conflictCount: 0,
  };
}


