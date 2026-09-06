import { ApiClientError } from '@/services/api/http-client';

export interface UiError {
  message: string;
  fieldErrors: Record<string, string>;
  status?: number;
}

export function mapErrorToUi(error: unknown): UiError {
  if (error instanceof ApiClientError) {
    return {
      message: error.message,
      fieldErrors: error.fieldErrors,
      status: error.status,
    };
  }

  if (error instanceof Error) {
    return {
      message: error.message,
      fieldErrors: {},
    };
  }

  return {
    message: 'Une erreur inattendue est survenue',
    fieldErrors: {},
  };
}

