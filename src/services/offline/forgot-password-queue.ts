import AsyncStorage from '@react-native-async-storage/async-storage';

import type { ForgotPasswordRequest } from '@/services/api/generated/model';
import { ApiClientError } from '@/services/api/http-client';

const FORGOT_PASSWORD_QUEUE_KEY = 'offline.auth.forgot-password.v1';

interface PendingForgotPasswordEntry {
  request: ForgotPasswordRequest;
  queuedAt: string;
  attempts: number;
  lastErrorMessage?: string;
}

interface FlushResult {
  status: 'none' | 'synced' | 'retry_later' | 'failed';
  email?: string;
  message?: string;
}

async function readEntry(): Promise<PendingForgotPasswordEntry | null> {
  const rawValue = await AsyncStorage.getItem(FORGOT_PASSWORD_QUEUE_KEY);
  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue) as PendingForgotPasswordEntry;
  } catch {
    await AsyncStorage.removeItem(FORGOT_PASSWORD_QUEUE_KEY);
    return null;
  }
}

async function writeEntry(entry: PendingForgotPasswordEntry): Promise<void> {
  await AsyncStorage.setItem(FORGOT_PASSWORD_QUEUE_KEY, JSON.stringify(entry));
}

export async function enqueuePendingForgotPassword(request: ForgotPasswordRequest): Promise<void> {
  await writeEntry({
    request,
    queuedAt: new Date().toISOString(),
    attempts: 0,
  });
}

export async function clearPendingForgotPassword(): Promise<void> {
  await AsyncStorage.removeItem(FORGOT_PASSWORD_QUEUE_KEY);
}

export async function flushPendingForgotPassword(
  sync: (request: ForgotPasswordRequest) => Promise<void>
): Promise<FlushResult> {
  const entry = await readEntry();
  if (!entry) {
    return { status: 'none' };
  }

  try {
    await sync(entry.request);
    await clearPendingForgotPassword();

    return {
      status: 'synced',
      email: entry.request.email,
    };
  } catch (error) {
    if (error instanceof ApiClientError && error.status >= 400 && error.status < 500) {
      await clearPendingForgotPassword();
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
      message: 'Demande en attente de synchronisation',
    };
  }
}

