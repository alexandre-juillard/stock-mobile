import AsyncStorage from '@react-native-async-storage/async-storage';

import { ApiClientError } from '@/services/api/http-client';

const SYNC_ERROR_FALLBACK_MESSAGE = 'Erreur de synchronisation';

export type QueueFlushStatus = 'none' | 'synced' | 'retry_later' | 'failed';

export interface QueueFlushResult {
  status: QueueFlushStatus;
  syncedCount: number;
  retryCount: number;
  failedCount: number;
}

export interface QueuedEntryMeta {
  queuedAt: string;
  attempts: number;
  lastErrorMessage?: string;
}

export function createQueueEntryId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

export function createQueuedEntryMeta(): QueuedEntryMeta {
  return {
    queuedAt: new Date().toISOString(),
    attempts: 0,
  };
}

/**
 * Une erreur 4xx est définitive : rejouer la requête ne changera rien.
 * Toute autre erreur (réseau, 5xx...) peut être retentée plus tard.
 */
export function isNonRetryableError(error: unknown): error is ApiClientError {
  return error instanceof ApiClientError && error.status >= 400 && error.status < 500;
}

export function shouldQueueAfterError(error: unknown): boolean {
  return !isNonRetryableError(error);
}

function withFailedAttempt<T extends QueuedEntryMeta>(entry: T, error: unknown): T {
  return {
    ...entry,
    attempts: entry.attempts + 1,
    lastErrorMessage: error instanceof Error ? error.message : SYNC_ERROR_FALLBACK_MESSAGE,
  };
}

export interface ListStorage<T> {
  read: () => Promise<T[]>;
  write: (items: T[]) => Promise<void>;
  clear: () => Promise<void>;
}

export function createListStorage<T>(storageKey: string): ListStorage<T> {
  const clear = () => AsyncStorage.removeItem(storageKey);

  return {
    clear,
    async read() {
      const rawValue = await AsyncStorage.getItem(storageKey);
      if (!rawValue) {
        return [];
      }

      try {
        const parsedValue: unknown = JSON.parse(rawValue);
        if (Array.isArray(parsedValue)) {
          return parsedValue as T[];
        }
      } catch {
        // Valeur corrompue : on la purge ci-dessous.
      }

      await clear();
      return [];
    },
    async write(items) {
      if (items.length === 0) {
        await clear();
        return;
      }

      await AsyncStorage.setItem(storageKey, JSON.stringify(items));
    },
  };
}

export interface PersistentQueue<T extends QueuedEntryMeta> extends ListStorage<T> {
  append: (entry: T) => Promise<void>;
  count: (predicate?: (entry: T) => boolean) => Promise<number>;
  /**
   * Rejoue les entrées dans l'ordre : succès → retirée, erreur 4xx → abandonnée,
   * autre erreur → conservée pour un prochain essai.
   */
  flush: (execute: (entry: T) => Promise<void>) => Promise<QueueFlushResult>;
}

export function createPersistentQueue<T extends QueuedEntryMeta>(
  storageKey: string
): PersistentQueue<T> {
  const storage = createListStorage<T>(storageKey);

  return {
    ...storage,
    async append(entry) {
      const queue = await storage.read();
      queue.push(entry);
      await storage.write(queue);
    },
    async count(predicate) {
      const queue = await storage.read();
      return predicate ? queue.filter(predicate).length : queue.length;
    },
    async flush(execute) {
      const queue = await storage.read();
      if (queue.length === 0) {
        return { status: 'none', syncedCount: 0, retryCount: 0, failedCount: 0 };
      }

      const retryQueue: T[] = [];
      let syncedCount = 0;
      let failedCount = 0;

      for (const entry of queue) {
        try {
          await execute(entry);
          syncedCount += 1;
        } catch (error) {
          if (isNonRetryableError(error)) {
            failedCount += 1;
            continue;
          }

          retryQueue.push(withFailedAttempt(entry, error));
        }
      }

      await storage.write(retryQueue);

      if (retryQueue.length > 0) {
        return { status: 'retry_later', syncedCount, retryCount: retryQueue.length, failedCount };
      }

      return {
        status: failedCount > 0 ? 'failed' : 'synced',
        syncedCount,
        retryCount: 0,
        failedCount,
      };
    },
  };
}

interface PendingSingleRequest<TRequest> extends QueuedEntryMeta {
  request: TRequest;
}

export type SingleRequestFlushResult<TRequest, TResult> =
  | { status: 'none' }
  | { status: 'synced'; request: TRequest; result: TResult }
  | { status: 'failed' | 'retry_later'; message: string };

export interface SingleRequestQueue<TRequest> {
  enqueue: (request: TRequest) => Promise<void>;
  clear: () => Promise<void>;
  flush: <TResult>(
    sync: (request: TRequest) => Promise<TResult>
  ) => Promise<SingleRequestFlushResult<TRequest, TResult>>;
}

/**
 * File à une seule entrée (la dernière demande remplace la précédente),
 * utilisée pour les formulaires d'authentification soumis hors ligne.
 */
export function createSingleRequestQueue<TRequest>(
  storageKey: string,
  retryLaterMessage: string
): SingleRequestQueue<TRequest> {
  const clear = () => AsyncStorage.removeItem(storageKey);

  async function readEntry(): Promise<PendingSingleRequest<TRequest> | null> {
    const rawValue = await AsyncStorage.getItem(storageKey);
    if (!rawValue) {
      return null;
    }

    try {
      return JSON.parse(rawValue) as PendingSingleRequest<TRequest>;
    } catch {
      await clear();
      return null;
    }
  }

  async function writeEntry(entry: PendingSingleRequest<TRequest>): Promise<void> {
    await AsyncStorage.setItem(storageKey, JSON.stringify(entry));
  }

  return {
    clear,
    async enqueue(request) {
      await writeEntry({ request, ...createQueuedEntryMeta() });
    },
    async flush(sync) {
      const entry = await readEntry();
      if (!entry) {
        return { status: 'none' };
      }

      try {
        const result = await sync(entry.request);
        await clear();
        return { status: 'synced', request: entry.request, result };
      } catch (error) {
        if (isNonRetryableError(error)) {
          await clear();
          return { status: 'failed', message: error.message };
        }

        await writeEntry(withFailedAttempt(entry, error));
        return { status: 'retry_later', message: retryLaterMessage };
      }
    },
  };
}
