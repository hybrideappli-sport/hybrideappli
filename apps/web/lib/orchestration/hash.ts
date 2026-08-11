import "server-only";

import { createHash } from "node:crypto";

/**
 * Hash canonique d'un `PlanningContext` (ADR-005 §2) : sérialisation JSON avec tri récursif des
 * clés d'objet pour que deux contextes structurellement identiques produisent le même hash quel
 * que soit l'ordre de construction. Utilisé pour `plan_versions.input_snapshot_hash`
 * (idempotence, `plan_versions_idempotency`) et pour l'audit (`engine_runs.input_snapshot_hash`).
 */
export function canonicalHash(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const entries = keys.map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`);
  return `{${entries.join(",")}}`;
}
