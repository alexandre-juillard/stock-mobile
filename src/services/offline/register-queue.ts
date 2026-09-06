import AsyncStorage from '@react-native-async-storage/async-storage';

import type { RegisterRequest } from '@/services/api/generated/model';
import { ApiClientError } from '@/services/api/http-client';

const REGISTER_QUEUE_KEY = 'offline.auth.register.v1';

interface PendingRegisterEntry {
  request: RegisterRequest;
  queuedAt: string;
  attempts: number;
  lastErrorMessage?: string;
}

interface FlushResult {
  status: 'none' | 'synced' | 'retry_later' | 'failed';
  email?: string;
  message?: string;
}

async function readEntry(): Promise<PendingRegisterEntry | null> {
  const rawValue = await AsyncStorage.getItem(REGISTER_QUEUE_KEY);
  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue) as PendingRegisterEntry;
  } catch {
    await AsyncStorage.removeItem(REGISTER_QUEUE_KEY);
    return null;
  }
}

async function writeEntry(entry: PendingRegisterEntry): Promise<void> {
  await AsyncStorage.setItem(REGISTER_QUEUE_KEY, JSON.stringify(entry));
}

export async function enqueuePendingRegister(request: RegisterRequest): Promise<void> {
  await writeEntry({
    request,
    queuedAt: new Date().toISOString(),
    attempts: 0,
  });
}

export async function clearPendingRegister(): Promise<void> {
  await AsyncStorage.removeItem(REGISTER_QUEUE_KEY);
}

export async function flushPendingRegister(
  sync: (request: RegisterRequest) => Promise<void>
): Promise<FlushResult> {
  const entry = await readEntry();
  if (!entry) {
    return { status: 'none' };
  }

  try {
    await sync(entry.request);
    await clearPendingRegister();
    return {
      status: 'synced',
      email: entry.request.email,
    };
  } catch (error) {
    if (error instanceof ApiClientError && error.status >= 400 && error.status < 500) {
      await clearPendingRegister();
      return {
        status: 'failed',
        message: error.message,
      };
    }

    await writeEntry({
      ...entry,
      attempts: entry.attempts + 1,
      lastErrorMessage: error instanceof Error ? error.message : 'Erreur de synchronisation',
    });

    return {
      status: 'retry_later',
      message: 'Inscription en attente de synchronisation',
    };
  }
}

