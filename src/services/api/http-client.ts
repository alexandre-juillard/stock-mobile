import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { emitUnauthorized } from '@/services/auth/auth-events';
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

  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  return rewriteLocalhostBaseUrl(normalizedBaseUrl);
}

function isLocalhostHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

function extractHostFromUri(rawHostUri: string | undefined): string | null {
  if (!rawHostUri) {
    return null;
  }

  const [host] = rawHostUri.split(':');
  if (!host || isLocalhostHost(host)) {
    return null;
  }

  return host;
}

function resolveExpoPackagerHost(): string | null {
  const expoHostFromConfig = extractHostFromUri(
    (Constants.expoConfig as { hostUri?: string } | null | undefined)?.hostUri
  );

  if (expoHostFromConfig) {
    return expoHostFromConfig;
  }

  const expoHostFromManifest = extractHostFromUri(
    (
      Constants.manifest2 as
        | {
            extra?: {
              expoClient?: {
                hostUri?: string;
              };
            };
          }
        | null
        | undefined
    )?.extra?.expoClient?.hostUri
  );

  return expoHostFromManifest;
}

function rewriteLocalhostBaseUrl(baseUrl: string): string {
  let parsedBaseUrl: URL;

  try {
    parsedBaseUrl = new URL(baseUrl);
  } catch {
    return baseUrl;
  }

  if (!isLocalhostHost(parsedBaseUrl.hostname)) {
    return baseUrl;
  }

  const expoPackagerHost = resolveExpoPackagerHost();
  if (expoPackagerHost) {
    parsedBaseUrl.hostname = expoPackagerHost;
    return parsedBaseUrl.toString().replace(/\/$/, '');
  }

  if (Platform.OS === 'android') {
    parsedBaseUrl.hostname = '10.0.2.2';
    return parsedBaseUrl.toString().replace(/\/$/, '');
  }

  return baseUrl;
}

let cachedApiBaseUrl: string | null = null;

/**
 * URL de base de l'API, avec `localhost` réécrit vers l'hôte joignable depuis
 * l'appareil (IP LAN du packager Expo ou 10.0.2.2 sur émulateur Android).
 * Calculée une seule fois : la configuration ne change pas pendant l'exécution.
 */
export function getApiBaseUrl(): string {
  if (cachedApiBaseUrl === null) {
    cachedApiBaseUrl = normalizeBaseUrl(API_BASE_URL);
  }

  return cachedApiBaseUrl;
}

function normalizePath(path: string): string {
  return path.startsWith('/') ? path : `/${path}`;
}

/**
 * Convertit un chemin renvoyé par l'API (ex. photo produit) en URL absolue
 * utilisable par un composant Image. Les URL déjà absolues sont conservées.
 */
export function resolveApiAssetUri(pathOrUrl: string): string {
  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://') || !API_BASE_URL) {
    return pathOrUrl;
  }

  return `${getApiBaseUrl()}${normalizePath(pathOrUrl)}`;
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
  // Le corps n'est lu qu'une fois : un JSON invalide ou non-objet ne doit pas
  // empêcher de remonter une ApiClientError (et donc la gestion du 401).
  const rawText = await response.text().catch(() => '');
  const contentType = response.headers.get('content-type') ?? '';

  if (rawText && contentType.includes('application/json')) {
    try {
      const jsonPayload: unknown = JSON.parse(rawText);

      if (isApiErrorPayload(jsonPayload)) {
        return jsonPayload;
      }

      if (typeof jsonPayload === 'string') {
        return { message: jsonPayload || undefined };
      }
    } catch {
      // Corps non JSON malgré l'en-tête : on garde le texte brut.
    }
  }

  return { message: rawText || undefined };
}

export async function apiFetch<T>(
  pathOrConfig: string | ApiRequestConfig,
  init: RequestInit = {}
): Promise<T> {
  const resolvedRequest = resolveRequest(pathOrConfig, init);
  const baseUrl = getApiBaseUrl();
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

  let response: Response;

  try {
    response = await fetch(`${baseUrl}${normalizedPath}`, {
      ...resolvedRequest.init,
      headers,
    });
  } catch (error) {
    if (error instanceof Error && /failed|network|connect/i.test(error.message)) {
      throw new Error(
        `Connexion API impossible (${baseUrl}). Sur smartphone, utilise l IP LAN de ta machine dans EXPO_PUBLIC_API_BASE_URL.`
      );
    }

    throw error;
  }

  if (!response.ok) {
    const payload = await parseErrorPayload(response);

    // Le token attaché à la requête est invalide/expiré : on notifie le
    // reste de l'appli (voir auth-context) pour effacer la session locale
    // et rediriger automatiquement l'utilisateur vers l'écran de connexion.
    if (response.status === 401 && accessToken) {
      emitUnauthorized();
    }

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


