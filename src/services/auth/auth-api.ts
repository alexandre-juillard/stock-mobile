import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { login } from '@/services/api/generated/authentification/authentification';
import type { LoginRequest, LoginResponse } from '@/services/api/generated/model';
import { apiFetch } from '@/services/api/http-client';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;
const OAUTH_REDIRECT_URI = process.env.EXPO_PUBLIC_OAUTH_REDIRECT_URI ?? 'stockshop://oauth2/callback';

WebBrowser.maybeCompleteAuthSession();

interface LinkRequiredResponse {
  status: 'LINK_REQUIRED';
  linkContext: string;
}

export interface OAuthExchangeResult {
  tokens?: LoginResponse;
  linkRequired?: LinkRequiredResponse;
}

function unwrapData<T>(value: T | { data?: T }): T {
  if (typeof value === 'object' && value !== null && 'data' in value) {
    const wrapped = value as { data?: T };
    if (wrapped.data !== undefined) {
      return wrapped.data;
    }
  }

  return value as T;
}

function ensureApiBaseUrl(): string {
  if (!API_BASE_URL) {
    throw new Error('EXPO_PUBLIC_API_BASE_URL is missing');
  }

  return API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
}

function isLinkRequiredResponse(value: unknown): value is LinkRequiredResponse {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const payload = value as Partial<LinkRequiredResponse>;
  return payload.status === 'LINK_REQUIRED' && typeof payload.linkContext === 'string';
}

function isLoginResponse(value: unknown): value is LoginResponse {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const payload = value as Partial<LoginResponse>;
  return typeof payload.accessToken === 'string' && typeof payload.refreshToken === 'string';
}

function buildOAuthGoogleUrl(): string {
  return `${ensureApiBaseUrl()}/api/auth/oauth2/google`;
}

async function exchangeOAuthCode(code: string): Promise<OAuthExchangeResult> {
  const response = await apiFetch<unknown>(`/api/auth/oauth2/exchange?code=${encodeURIComponent(code)}`);
  const payload = unwrapData(response as { data?: unknown } | unknown);

  if (isLinkRequiredResponse(payload)) {
    return { linkRequired: payload };
  }

  if (isLoginResponse(payload)) {
    return { tokens: payload };
  }

  throw new Error('Reponse OAuth2 inattendue');
}

function extractOAuthCodeFromCallback(url: string): string {
  const { queryParams } = Linking.parse(url);

  const error = queryParams?.error;
  if (typeof error === 'string' && error.length > 0) {
    throw new Error('Connexion Google echouee');
  }

  const code = queryParams?.code;
  if (typeof code !== 'string' || code.length === 0) {
    throw new Error('Code OAuth2 manquant dans la redirection');
  }

  return code;
}

export async function loginWithPassword(request: LoginRequest): Promise<LoginResponse> {
  const response = await login(request);
  const payload = unwrapData(response);

  if (!isLoginResponse(payload)) {
    throw new Error('Reponse de connexion invalide');
  }

  return payload;
}

export async function loginWithGoogle(): Promise<OAuthExchangeResult> {
  const authUrl = buildOAuthGoogleUrl();

  const authResult = await WebBrowser.openAuthSessionAsync(authUrl, OAUTH_REDIRECT_URI);

  if (authResult.type === 'cancel' || authResult.type === 'dismiss') {
    throw new Error('Connexion Google annulee');
  }

  if (authResult.type !== 'success') {
    throw new Error('Connexion Google interrompue');
  }

  const code = extractOAuthCodeFromCallback(authResult.url);

  const exchangeResult = await exchangeOAuthCode(code);

  if (Platform.OS === 'web') {
    await WebBrowser.dismissAuthSession();
  }

  return exchangeResult;
}

