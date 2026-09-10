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
  // US-03 — `POST /schedule/incidents` (`08-architecture.md` §14.5).
  | "SESSION_NOT_REPORTABLE"
  | "PLACEMENT_FAILED"
  // ADR-018, lot L2 — `GET /api/v1/map/trails`.
  | "OVERPASS_UNAVAILABLE"
  | "MAP_TILES_UNAVAILABLE"
  | "INTERNAL_ERROR";

export function apiError(status: number, code: ApiErrorCode, message: string, details?: unknown, headers?: HeadersInit) {
  return NextResponse.json({ error: { code, message, details } }, { status, headers });
}

export function apiJson<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}
