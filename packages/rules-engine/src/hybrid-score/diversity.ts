/**
 * D — hybridité (ADR-014 §1). La composante qui rend le score *hybride* plutôt que "volume
 * d'entraînement".
 *
 * `p_d = part de load_units de la discipline d sur la fenêtre chronique`
 * `D = min(1, −Σ p_d·ln(p_d) / ln(diversity_reference_disciplines))`
 *
 * Entropie de Shannon normalisée. `D = 0` pour une discipline unique (une seule part = 1, entropie
 * nulle), `D = 1` pour `diversity_reference_disciplines` disciplines parfaitement équilibrées.
 */

import type { HybridScoreByDisciplineItem, HybridScoreSessionInput } from "@hybride/domain";

export interface DiversitySubscoreResult {
  /** Entropie de Shannon brute (nats), non normalisée. */
  raw: number;
  /** `D` ∈ [0, 1]. */
  normalized: number;
  /** Répartition par discipline, triée par charge décroissante — alimente `S-split-card`. */
  byDiscipline: HybridScoreByDisciplineItem[];
}

interface DisciplineGroup {
  sportId: string | null;
  sportCode: string | null;
  loadUnits: number;
}

export function computeDiversitySubscore(
  sessionsInChronicWindow: HybridScoreSessionInput[],
  diversityReferenceDisciplines: number,
): DiversitySubscoreResult {
  const groups = new Map<string, DisciplineGroup>();
  for (const session of sessionsInChronicWindow) {
    if (session.loadUnits <= 0) continue;
    const key = `${session.sportId ?? "∅"}::${session.sportCode ?? "∅"}`;
    const existing = groups.get(key);
    if (existing) {
      existing.loadUnits += session.loadUnits;
    } else {
      groups.set(key, { sportId: session.sportId, sportCode: session.sportCode, loadUnits: session.loadUnits });
    }
  }

  const totalLoadUnits = Array.from(groups.values()).reduce((sum, g) => sum + g.loadUnits, 0);

  const byDiscipline: HybridScoreByDisciplineItem[] = Array.from(groups.values())
    .map((g) => ({
      sportId: g.sportId,
      sportCode: g.sportCode,
      loadUnits: g.loadUnits,
      sharePct: totalLoadUnits > 0 ? Math.round((g.loadUnits / totalLoadUnits) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.loadUnits - a.loadUnits || (a.sportCode ?? "").localeCompare(b.sportCode ?? ""));

  if (totalLoadUnits <= 0 || byDiscipline.length === 0) {
    return { raw: 0, normalized: 0, byDiscipline };
  }

  const entropy = -byDiscipline.reduce((sum, item) => {
    const p = item.loadUnits / totalLoadUnits;
    return sum + p * Math.log(p);
  }, 0);

  // `ln(1) = 0` diviserait par zéro si `diversity_reference_disciplines` valait 1 — garde
  // défensive, cette valeur n'a de sens produit qu'à partir de 2 (ADR-014 §1 : "trois disciplines
  // équilibrées = hybridité pleine" — 2 est la borne basse pour que la notion même de "diversité"
  // ait un sens mathématique).
  const referenceEntropy = Math.log(Math.max(diversityReferenceDisciplines, 2));
  const normalized = referenceEntropy > 0 ? Math.min(1, entropy / referenceEntropy) : 0;

  return { raw: entropy, normalized, byDiscipline };
}
