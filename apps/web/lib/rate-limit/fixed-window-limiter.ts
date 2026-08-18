/**
 * `FixedWindowRateLimiter` — I3 (ADR-013 §1 : « limitation de débit », citée parmi les défenses
 * complémentaires de `POST /webhooks/strava/:pathSecret`, jamais implémentée jusqu'à ce lot).
 *
 * Choix assumé : EN MÉMOIRE DE PROCESSUS, pas en base. Trois raisons :
 *
 * 1. **Aucune infrastructure de limitation de débit n'existe nulle part dans le projet** (pas de
 *    Redis/Upstash dans les dépendances) — introduire une dépendance externe pour UN SEUL endpoint
 *    serait disproportionné.
 * 2. **La garantie réelle de cet endpoint ne vient pas de la limitation de débit** (ADR-013 §1,
 *    dernier paragraphe : « Aucune de ces mesures n'est une authentification ; […] la garantie
 *    réelle vient du re-fetch » de l'activité avec notre propre jeton). La limitation de débit est
 *    ici une défense de PROFONDEUR contre un flot de requêtes une fois le secret de chemin deviné —
 *    elle n'a pas besoin de survivre à un redémarrage pour remplir ce rôle : un redémarrage réinitialise
 *    aussi l'attaque en cours.
 * 3. **Un compteur Postgres coûterait une écriture par requête webhook** sur le chemin le plus chaud
 *    de l'intégration Strava, pour un bénéfice marginal par rapport à la mémoire de processus — à
 *    l'inverse de l'idempotence de `job_queue`, qui DOIT survivre au redémarrage (c'est tout son
 *    rôle) et ne s'exécute qu'au drain, pas à chaque requête entrante.
 *
 * Limite connue, assumée : sur un déploiement multi-instance (plusieurs process Node derrière le
 * load balancer), chaque instance a son propre compteur — la limite RÉELLE est `max × nombre
 * d'instances`, pas `max`. Documenté plutôt que caché : suffisant pour détecter et journaliser un
 * afflux anormal (l'objectif de ce lot), pas une garantie distribuée exacte.
 */
export interface FixedWindowRateLimiterOptions {
  windowMs: number;
  max: number;
}

export interface RateLimitOutcome {
  allowed: boolean;
  remaining: number;
  /** Délai avant qu'une nouvelle requête soit acceptée, `0` si `allowed`. */
  retryAfterMs: number;
}

interface WindowState {
  count: number;
  windowStartedAt: number;
}

export class FixedWindowRateLimiter {
  private readonly windowMs: number;
  private readonly max: number;
  private readonly state = new Map<string, WindowState>();

  constructor(options: FixedWindowRateLimiterOptions) {
    this.windowMs = options.windowMs;
    this.max = options.max;
  }

  /** `key` permet de partager UNE instance entre plusieurs compteurs indépendants (ex. par IP). */
  consume(key: string, now: number = Date.now()): RateLimitOutcome {
    const existing = this.state.get(key);

    if (!existing || now - existing.windowStartedAt >= this.windowMs) {
      this.state.set(key, { count: 1, windowStartedAt: now });
      return { allowed: true, remaining: this.max - 1, retryAfterMs: 0 };
    }

    if (existing.count >= this.max) {
      return { allowed: false, remaining: 0, retryAfterMs: this.windowMs - (now - existing.windowStartedAt) };
    }

    existing.count += 1;
    return { allowed: true, remaining: this.max - existing.count, retryAfterMs: 0 };
  }

  /** Tests uniquement — évite la pollution d'état entre cas. */
  reset(): void {
    this.state.clear();
  }
}
