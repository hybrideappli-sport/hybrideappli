/**
 * Garde FAIL-CLOSED `MAP_TILES_PLAN` (ADR-018 §8, patron ADR-007 « refus de démarrage si un
 * garde-fou est `null` » et ADR-013 — `STRIPE_WEBHOOK_SECRET`/`STRAVA_WEBHOOK_SUBSCRIPTION_ID`).
 *
 * Les paliers gratuits des fournisseurs de tuiles (Stadia « Basic APIs only », MapTiler « testing,
 * personal or non-commercial use ») interdisent contractuellement l'usage commercial. En
 * production, servir la carte sur un palier non commercial est un risque juridique, pas une
 * dégradation acceptable : c'est pourquoi le refus est TOTAL (503), jamais un mode dégradé.
 *
 * Fonction PURE, sans effet de bord, testée indépendamment de l'endroit où elle est appelée
 * (`apps/web/proxy.ts` — voir `proxy.test.ts`).
 */
export function isMapTilesPlanProductionReady(env: NodeJS.ProcessEnv = process.env): boolean {
  // Hors production (dev, preview Vercel non taggée production, tests) : le palier gratuit est
  // explicitement autorisé — c'est là tout son intérêt pendant L1/L2/L3 (ADR-018 §Découpage).
  if (env.NODE_ENV !== "production") return true;

  return env.MAP_TILES_PLAN === "commercial";
}
