/**
 * `HybridScoreContext` / `HybridScoreResult` — US-02, ADR-014.
 *
 * Contexte DÉLIBÉRÉMENT étroit (ADR-014 §3) : `computeHybridScore()` reçoit les séances réalisées
 * de la fenêtre chronique et rien d'autre — pas le `PlanningContext` complet. Le score n'a pas
 * besoin de connaître l'objectif, les douleurs ni les restrictions médicales, et le lui donner
 * créerait un couplage inutile avec le pipeline de génération de plan (ADR-014 §6 : le score ne
 * pilote rien, aucune étape de `generatePlan()` ne l'appelle).
 *
 * AC9 — **source-agnostique par construction** : `HybridScoreSessionInput` ne porte aucun champ
 * `source`/`data_connection_id`. Une séance déclarée et une séance connectée sont rigoureusement
 * la même entrée pour le moteur ; c'est à l'appelant (`lib/score/compute-and-store-hybrid-score.ts`)
 * de résoudre `session_logs_counted` (excluded_at is null) avant de construire ce contexte, jamais
 * au moteur de filtrer par provenance.
 */

import type { DecisionTrace } from "./decision-trace";

export interface HybridScoreSessionInput {
  /** ISO date (YYYY-MM-DD) — date réalisée de la séance, jamais une heure. */
  loggedDate: string;
  sportId: string | null;
  /** Code référentiel (`sports.code`) — `null` si discipline non cartographiée (AC3). */
  sportCode: string | null;
  /** Charge réalisée déjà calculée côté serveur (`finalizeSessionLogLoad()`, ADR-015 §1). */
  loadUnits: number;
}

export interface HybridScoreContext {
  /** Date de référence — JAMAIS lue depuis l'horloge système (ADR-002), ISO date. */
  now: string;
  /**
   * Première date de donnée réalisée connue de l'utilisateur, déclarée OU connectée
   * indifféremment (AC9) — sert exclusivement à `weeksAvailable` (ADR-014 §4). `null` si
   * l'utilisateur n'a encore aucune donnée réalisée (⇒ calibration immédiate).
   */
  firstLoggedDate: string | null;
  /**
   * Séances réalisées de la fenêtre chronique UNIQUEMENT (`ruleset.hybrid_score.chronic_window_days`
   * jours glissants avant `now`, bornes incluses), déjà résolues contre `session_logs_counted`
   * (fusions/exclusions déjà appliquées par l'appelant — ADR-015 §2). Le moteur ne filtre rien : il
   * agrège tel quel ce qu'on lui donne.
   */
  sessions: HybridScoreSessionInput[];
}

export type HybridScoreStatus = "calibration" | "available";

export interface HybridScoreSubcomponent {
  /** Valeur brute avant normalisation (ex. `L_chronic` en load_units/semaine pour le volume). */
  raw: number;
  /** Valeur normalisée 0-1 injectée dans la somme pondérée (ADR-014 §1). */
  normalized: number;
}

export interface HybridScoreComponents {
  volume: HybridScoreSubcomponent;
  consistency: HybridScoreSubcomponent;
  diversity: HybridScoreSubcomponent;
}

export interface HybridScoreByDisciplineItem {
  sportId: string | null;
  sportCode: string | null;
  loadUnits: number;
  /** 0-100, part de `loadUnitsTotal` sur la fenêtre chronique. */
  sharePct: number;
}

export interface HybridScoreByDayItem {
  /** ISO date (YYYY-MM-DD). */
  date: string;
  loadUnits: number;
}

export interface HybridScoreResult {
  status: HybridScoreStatus;
  /** 0-100, entier. `null` si et seulement si `status === 'calibration'` (AC8). */
  score: number | null;
  components: HybridScoreComponents;
  /** Nombre de semaines PLEINES écoulées depuis `context.firstLoggedDate` (ADR-014 §4). */
  weeksAvailable: number;
  weeksRequired: number;
  sessionsCounted: number;
  sessionsRequired: number;
  /** Nombre de disciplines distinctes cartographiées (sportCode non nul) sur la fenêtre chronique. */
  disciplinesCounted: number;
  loadUnitsTotal: number;
  byDiscipline: HybridScoreByDisciplineItem[];
  /** `acute_window_days` valeurs (7 par défaut) — histogramme d'affichage, design §4.3. */
  byDay: HybridScoreByDayItem[];
  /** Bornes de la fenêtre CHRONIQUE (calcul), pas de la fenêtre d'affichage. ISO date. */
  windowStart: string;
  windowEnd: string;
  /** ADR-006 — aucune règle du moteur ne produit une valeur sans trace associée. */
  trace: DecisionTrace;
}

// ---------------------------------------------------------------------------
// GET /api/v1/score/hybrid — vue API, `08-architecture.md` §13.3. Distincte de `HybridScoreResult`
// (sortie brute du moteur) : cette vue est produite par `lib/score/compute-and-store-hybrid-score.ts`,
// après persistance, avec le delta recalculé (ADR-014 §2, JAMAIS relu) et l'explication rendue.
// ---------------------------------------------------------------------------

export interface HybridScoreVolumeDayView {
  date: string; // ISO date
  loadUnits: number;
}

/** `S-volume-card` — fenêtre d'AFFICHAGE (`acute_window_days`, 7 par défaut). */
export interface HybridScoreVolumeView {
  totalLoadUnits: number;
  deltaPct: number | null; // vs semaine précédente, null si non calculable (pas assez d'historique)
  days: HybridScoreVolumeDayView[]; // 7 valeurs, jour courant marqué côté UI (design §4.3)
}

export interface HybridScoreSplitItemView {
  sportCode: string | null;
  label: string;
  sharePct: number;
}

/** `S-split-card`. `null` tant que `status === 'calibration'` sans aucune séance. */
export interface HybridScoreSplitView {
  items: HybridScoreSplitItemView[];
}

export interface HybridScoreComponentView {
  normalized: number;
  weight: number;
  raw: number;
  label: string;
}

export interface HybridScoreNextStepView {
  kind: "connect_sources" | "log_session";
  label: string;
}

export type HybridScoreResponse =
  | {
      status: "calibration"; // AC8 — sortie NOMINALE, jamais une erreur
      weeksAvailable: number;
      weeksRequired: number;
      sessionsCounted: number;
      sessionsRequired: number;
      message: string;
      volume: HybridScoreVolumeView;
      split: HybridScoreSplitView | null;
      nextStep: HybridScoreNextStepView;
    }
  | {
      status: "available";
      score: number; // 0-100
      delta: { value: number; since: string } | null; // recalculé à J-7, jamais relu (ADR-014 §2)
      components: { volume: HybridScoreComponentView; consistency: HybridScoreComponentView; diversity: HybridScoreComponentView };
      basis: { sessions: number; disciplines: number; windowDays: number };
      volume: HybridScoreVolumeView;
      split: HybridScoreSplitView;
      provenance: { connected: number; declared: number };
      explanation: { short: string; explanationId: string } | null;
      rulesetVersion: string;
    };
