import AsyncStorage from '@react-native-async-storage/async-storage';

import type { LinkDecisionRequest, LoginResponse } from '@/services/api/generated/model';
import { ApiClientError } from '@/services/api/http-client';

const OAUTH2_LINK_DECISION_QUEUE_KEY = 'offline.auth.oauth2-link-decision.v1';

interface PendingOAuth2LinkDecisionEntry {
  request: LinkDecisionRequest;
  queuedAt: string;
  attempts: number;
  lastErrorMessage?: string;
}

interface FlushResult {
  status: 'none' | 'synced' | 'retry_later' | 'failed';
  tokens?: LoginResponse;
  message?: string;
}

async function readEntry(): Promise<PendingOAuth2LinkDecisionEntry | null> {
  const rawValue = await AsyncStorage.getItem(OAUTH2_LINK_DECISION_QUEUE_KEY);
  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue) as PendingOAuth2LinkDecisionEntry;
  } catch {
    await AsyncStorage.removeItem(OAUTH2_LINK_DECISION_QUEUE_KEY);
    return null;
  }
}

async function writeEntry(entry: PendingOAuth2LinkDecisionEntry): Promise<void> {
  await AsyncStorage.setItem(OAUTH2_LINK_DECISION_QUEUE_KEY, JSON.stringify(entry));
}

export async function enqueuePendingOAuth2LinkDecision(request: LinkDecisionRequest): Promise<void> {
  await writeEntry({
    request,
    queuedAt: new Date().toISOString(),
    attempts: 0,
  });
}

export async function clearPendingOAuth2LinkDecision(): Promise<void> {
  await AsyncStorage.removeItem(OAUTH2_LINK_DECISION_QUEUE_KEY);
}

export async function flushPendingOAuth2LinkDecision(
  sync: (request: LinkDecisionRequest) => Promise<LoginResponse>
): Promise<FlushResult> {
  const entry = await readEntry();
  if (!entry) {
    return { status: 'none' };
  }

  try {
    const tokens = await sync(entry.request);
    await clearPendingOAuth2LinkDecision();

    return {
      status: 'synced',
      tokens,
    };
  } catch (error) {
    if (error instanceof ApiClientError && error.status >= 400 && error.status < 500) {
      await clearPendingOAuth2LinkDecision();
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
      message: 'Decision en attente de synchronisation',
    };
  }
}

