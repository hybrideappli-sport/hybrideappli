/**
 * Limiteur de CONCURRENCE sortante (ADR-018 §4.3, N4 — « concurrence sortante bornée à 2 vers
 * Overpass »), politique d'usage des serveurs Overpass publics (créneaux simultanés par IP).
 *
 * PUR : aucune dépendance à `fetch` ni au réseau, testable indépendamment de tout appel réel.
 * En mémoire de PROCESSUS, même choix que `FixedWindowRateLimiter` (`lib/rate-limit/`) et pour la
 * même raison — introduire une dépendance externe pour borner un seul appel sortant serait
 * disproportionné.
 */
export interface ConcurrencyLimiter {
  run<T>(task: () => Promise<T>): Promise<T>;
}

export function createConcurrencyLimiter(maxConcurrent: number): ConcurrencyLimiter {
  let active = 0;
  const queue: Array<() => void> = [];

  function releaseNext(): void {
    if (active >= maxConcurrent) return;
    const resolveNext = queue.shift();
    if (!resolveNext) return;
    active += 1;
    resolveNext();
  }

  async function acquire(): Promise<void> {
    if (active < maxConcurrent) {
      active += 1;
      return;
    }
    await new Promise<void>((resolve) => queue.push(resolve));
  }

  function release(): void {
    active -= 1;
    releaseNext();
  }

  return {
    async run<T>(task: () => Promise<T>): Promise<T> {
      await acquire();
      try {
        return await task();
      } finally {
        release();
      }
    },
  };
}
