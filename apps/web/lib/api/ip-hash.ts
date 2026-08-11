import { createHash } from "node:crypto";

/**
 * `consents.ip_hash` — calculé côté serveur, jamais fourni par le client (ADR-010 §1, ADR-012
 * §1). Hash simple (pas de sel dédié en base de secrets à ce lot) : suffisant pour la preuve
 * d'usage attendue par le registre de consentement, pas un mécanisme anti-forensique.
 */
export function hashIp(request: Request): string | null {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const ip = forwardedFor?.split(",")[0]?.trim();
  if (!ip) return null;
  return createHash("sha256").update(ip).digest("hex");
}

export function getUserAgent(request: Request): string | null {
  return request.headers.get("user-agent");
}
