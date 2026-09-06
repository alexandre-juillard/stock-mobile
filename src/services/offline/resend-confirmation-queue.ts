import AsyncStorage from '@react-native-async-storage/async-storage';

import type { ResendConfirmationRequest } from '@/services/api/generated/model';
import { ApiClientError } from '@/services/api/http-client';

const RESEND_CONFIRMATION_QUEUE_KEY = 'offline.auth.resend-confirmation.v1';

interface PendingResendConfirmationEntry {
  request: ResendConfirmationRequest;
  queuedAt: string;
  attempts: number;
  lastErrorMessage?: string;
}

interface FlushResult {
  status: 'none' | 'synced' | 'retry_later' | 'failed';
  email?: string;
  message?: string;
}

async function readEntry(): Promise<PendingResendConfirmationEntry | null> {
  const rawValue = await AsyncStorage.getItem(RESEND_CONFIRMATION_QUEUE_KEY);
  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue) as PendingResendConfirmationEntry;
  } catch {
    await AsyncStorage.removeItem(RESEND_CONFIRMATION_QUEUE_KEY);
    return null;
  }
}

async function writeEntry(entry: PendingResendConfirmationEntry): Promise<void> {
  await AsyncStorage.setItem(RESEND_CONFIRMATION_QUEUE_KEY, JSON.stringify(entry));
}

export async function enqueuePendingResendConfirmation(
  request: ResendConfirmationRequest
): Promise<void> {
  await writeEntry({
    request,
    queuedAt: new Date().toISOString(),
    attempts: 0,
  });
}

export async function clearPendingResendConfirmation(): Promise<void> {
  await AsyncStorage.removeItem(RESEND_CONFIRMATION_QUEUE_KEY);
}

export async function flushPendingResendConfirmation(
  sync: (request: ResendConfirmationRequest) => Promise<void>
): Promise<FlushResult> {
  const entry = await readEntry();
  if (!entry) {
    return { status: 'none' };
  }

  try {
    await sync(entry.request);
    await clearPendingResendConfirmation();
    return {
      status: 'synced',
      email: entry.request.email,
    };
  } catch (error) {
    if (error instanceof ApiClientError && error.status >= 400 && error.status < 500) {
      await clearPendingResendConfirmation();
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
      message: 'Renvoi de confirmation en attente de synchronisation',
    };
  }
}

