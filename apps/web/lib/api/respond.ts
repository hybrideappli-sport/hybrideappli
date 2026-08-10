import { NextResponse } from "next/server";

/**
 * Enveloppe d'erreur normalisée (`08-architecture.md` §6) :
 * `{ error: { code, message, details? } }`, codes stables.
 */
export type ApiErrorCode =
  | "VALIDATION_FAILED"
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "PAYWALL_REQUIRED"
  | "CONSENT_REQUIRED"
  | "CONSENT_DOCUMENT_UNAVAILABLE"
  | "CALIBRATION_IN_PROGRESS"
  | "ENGINE_FAILED"
  | "RATE_LIMITED"
  | "CONFLICT"
  | "INTERNAL_ERROR";

export function apiError(status: number, code: ApiErrorCode, message: string, details?: unknown) {
  return NextResponse.json({ error: { code, message, details } }, { status });
}

export function apiJson<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}
