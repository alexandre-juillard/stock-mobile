import { getAccessToken } from '@/services/auth/token-storage';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

interface ApiRequestConfig extends RequestInit {
  url: string;
  method?: string;
  params?: Record<string, unknown>;
  data?: unknown;
}

export interface ApiErrorPayload {
  timestamp?: string;
  status?: number;
  error?: string;
  message?: string;
  path?: string;
  fieldErrors?: Record<string, string>;
  [key: string]: unknown;
}

export class ApiClientError extends Error {
  status: number;
  path: string;
  fieldErrors: Record<string, string>;
  details: ApiErrorPayload;

  constructor(payload: ApiErrorPayload, fallbackStatus: number, fallbackPath: string) {
    super(payload.message ?? 'Une erreur API est survenue');
    this.name = 'ApiClientError';
    this.status = payload.status ?? fallbackStatus;
    this.path = payload.path ?? fallbackPath;
    this.fieldErrors = payload.fieldErrors ?? {};
    this.details = payload;
  }
}

function normalizeBaseUrl(baseUrl: string | undefined): string {
  if (!baseUrl) {
    throw new Error('EXPO_PUBLIC_API_BASE_URL is missing');
  }

  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
}

function normalizePath(path: string): string {
  return path.startsWith('/') ? path : `/${path}`;
}

function appendParams(path: string, params: Record<string, unknown> | undefined): string {
  if (!params || Object.keys(params).length === 0) {
    return path;
  }

  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, rawValue]) => {
    if (rawValue === undefined || rawValue === null) {
      return;
    }

    if (Array.isArray(rawValue)) {
      rawValue.forEach((arrayValue) => searchParams.append(key, String(arrayValue)));
      return;
    }

    searchParams.append(key, String(rawValue));
  });

  const queryString = searchParams.toString();
  if (!queryString) {
    return path;
  }

  return `${path}?${queryString}`;
}

function resolveRequest(
  pathOrConfig: string | ApiRequestConfig,
  init: RequestInit
): { path: string; init: RequestInit } {
  if (typeof pathOrConfig === 'string') {
    return {
      path: pathOrConfig,
      init,
    };
  }

  const { url, method, params, data, body, ...rest } = pathOrConfig;
  const resolvedBody = data ?? body;

  return {
    path: appendParams(url, params),
    init: {
      ...rest,
      method,
      body:
        resolvedBody && typeof resolvedBody === 'object' && !(resolvedBody instanceof FormData)
          ? JSON.stringify(resolvedBody)
          : (resolvedBody as BodyInit | null | undefined),
    },
  };
}

function isApiErrorPayload(value: unknown): value is ApiErrorPayload {
  return typeof value === 'object' && value !== null;
}

async function parseErrorPayload(response: Response): Promise<ApiErrorPayload> {
  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    const jsonPayload = await response.json();

    if (isApiErrorPayload(jsonPayload)) {
      return jsonPayload;
    }
  }

  const rawText = await response.text();
  return { message: rawText || undefined };
}

export async function apiFetch<T>(
  pathOrConfig: string | ApiRequestConfig,
  init: RequestInit = {}
): Promise<T> {
  const resolvedRequest = resolveRequest(pathOrConfig, init);
  const baseUrl = normalizeBaseUrl(API_BASE_URL);
  const normalizedPath = normalizePath(resolvedRequest.path);
  const accessToken = await getAccessToken();

  const headers = new Headers(resolvedRequest.init.headers ?? {});
  const isFormDataBody =
    typeof FormData !== 'undefined' && resolvedRequest.init.body instanceof FormData;

  if (!isFormDataBody && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (accessToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  const response = await fetch(`${baseUrl}${normalizedPath}`, {
    ...resolvedRequest.init,
    headers,
  });

  if (!response.ok) {
    const payload = await parseErrorPayload(response);
    throw new ApiClientError(payload, response.status, normalizedPath);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const responseContentType = response.headers.get('content-type') ?? '';

  if (responseContentType.includes('application/json')) {
    return (await response.json()) as T;
  }

  return (await response.text()) as T;
}


