import type {LoadError, LoadErrorCode} from '../gedcom/types';

class GedviewLoadError extends Error implements LoadError {
  readonly code: LoadErrorCode;

  constructor(code: LoadErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'LoadError';
    this.code = code;
  }
}

export function loadError(
  code: LoadErrorCode,
  message: string,
  cause?: unknown,
): LoadError {
  return new GedviewLoadError(code, message, cause ? {cause} : undefined);
}

export function isLoadError(error: unknown): error is LoadError {
  return error instanceof GedviewLoadError;
}
