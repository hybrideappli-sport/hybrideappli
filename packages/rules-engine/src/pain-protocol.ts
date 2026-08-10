/**
 * `evaluatePainProtocol` — AC9, machine à états à 3 niveaux
 * (`08-architecture.md` §4.4).
 *
 * Entrée : l'état des épisodes déjà ouverts (`context.painEpisodes`, tel que
 * persisté par le run précédent) + les signaux de la fenêtre récente
 * (`context.history.sessionLogs`). Sortie : l'état à jour, PAR ZONE, prêt à
 * être persisté et à piloter la construction des séances (zones exclues).
 *
 * Trois transitions, exactement celles de la fiche :
 *  - douleur légère isolée            → 'light'    : adaptation, aucune alerte ;
 *  - N signaux consécutifs, même zone → 'persistent' : pause de la zone + consultation ;
 *  - douleur à l'effort ET au repos   → 'acute'     : arrêt total, orientation
 *    professionnel de santé, **aucune alternative d'auto-adaptation proposée**.
 */

import type { BodyZone, PainEpisodeSnapshot, PainProtocolResult, PainZoneState, PlanningContext, Ruleset } from "@hybride/domain";
import { RULE_IDS, RULE_VERSION } from "./rule-ids.js";
import type { TraceFactory } from "./lib/trace.js";
import { diffDays } from "./lib/dates.js";

function requireNonNull(value: number | null, path: string): number {
  if (value === null) {
    throw new Error(
      `Ruleset invalide pour le protocole douleur : "${path}" est null. ` +
        "Ce paramètre doit être renseigné avant toute exécution du moteur (voir ADR-007).",
    );
  }
  return value;
}

/** Le signal le plus récent, par zone, dans la fenêtre de persistance. */
function latestSignalsByZone(
  context: PlanningContext,
  windowDays: number,
): Map<BodyZone, PlanningContext["history"]["sessionLogs"]> {
  const byZone = new Map<BodyZone, PlanningContext["history"]["sessionLogs"]>();
  for (const log of context.history.sessionLogs) {
    if (log.pain === "none" || log.painZone === null) continue;
    const delta = diffDays(log.loggedDate, context.now);
    if (delta < 0 || delta > windowDays) continue;
    const zone = log.painZone;
    const list = byZone.get(zone) ?? [];
    list.push(log);
    byZone.set(zone, list);
  }
  for (const list of byZone.values()) {
    list.sort((a, b) => (a.loggedDate < b.loggedDate ? 1 : -1)); // desc
  }
  return byZone;
}

function findOpenEpisode(episodes: PainEpisodeSnapshot[], zone: BodyZone): PainEpisodeSnapshot | undefined {
  return episodes.find((ep) => ep.zone === zone && ep.resolvedAt === null);
}

export function evaluatePainProtocol(
  context: PlanningContext,
  ruleset: Ruleset,
  traceFactory: TraceFactory,
): PainProtocolResult {
  const persistentThreshold = requireNonNull(
    ruleset.params.pain_protocol.persistent_signal_threshold,
    "pain_protocol.persistent_signal_threshold",
  );
  const windowDays = requireNonNull(ruleset.params.pain_protocol.persistent_window_days, "pain_protocol.persistent_window_days");

  const signalsByZone = latestSignalsByZone(context, windowDays);
  const zoneStates: PainZoneState[] = [];
  const handledZones = new Set<BodyZone>();

  for (const [zone, logs] of signalsByZone.entries()) {
    handledZones.add(zone);
    const latest = logs[0]!;
    const existing = findOpenEpisode(context.painEpisodes, zone);

    if (latest.pain === "pain" && latest.painAtRest) {
      // AC9 niveau 3 — immédiat, pas besoin de persistance.
      const consecutiveSignals = existing && existing.zone === zone ? existing.consecutiveSignals + 1 : 1;
      zoneStates.push({
        zone,
        level: "acute",
        consecutiveSignals,
        zoneBlocked: true,
        referralRequired: true,
        autoAdaptationAllowed: false,
        trace: traceFactory.make({
          ruleId: RULE_IDS.painAcute,
          ruleVersion: RULE_VERSION,
          category: "pain",
          isHardGuardrail: true,
          scope: "pain_zone",
          scopeRefId: null,
          scopeRefDate: latest.loggedDate,
          conditionExpr: "pain = 'pain' AND pain_at_rest = true",
          inputsUsed: [
            { source: "session_logs", sourceId: latest.id, field: "pain", value: latest.pain, observedOn: latest.loggedDate },
            {
              source: "session_logs",
              sourceId: latest.id,
              field: "pain_at_rest",
              value: latest.painAtRest,
              observedOn: latest.loggedDate,
            },
          ],
          output: { field: "pain_protocol_level", before: existing?.level ?? "none", after: "acute", direction: "neutral" },
          severity: "critical",
        }),
      });
      continue;
    }

    // Compte les signaux consécutifs (pain != 'none') les plus récents sur cette zone,
    // sans interruption — `existing` porte le compteur déjà accumulé par les runs précédents.
    const consecutiveSignals = existing && existing.level !== "none" ? existing.consecutiveSignals + 1 : logs.length;

    if (consecutiveSignals >= persistentThreshold) {
      zoneStates.push({
        zone,
        level: "persistent",
        consecutiveSignals,
        zoneBlocked: true,
        referralRequired: true,
        autoAdaptationAllowed: true,
        trace: traceFactory.make({
          ruleId: RULE_IDS.painPersistent,
          ruleVersion: RULE_VERSION,
          category: "pain",
          isHardGuardrail: true,
          scope: "pain_zone",
          scopeRefId: null,
          scopeRefDate: latest.loggedDate,
          conditionExpr: `consecutive_signals(zone) >= ${persistentThreshold}`,
          inputsUsed: logs.map((log) => ({
            source: "session_logs",
            sourceId: log.id,
            field: "pain",
            value: log.pain,
            observedOn: log.loggedDate,
          })),
          output: {
            field: "pain_protocol_level",
            before: existing?.level ?? "none",
            after: "persistent",
            direction: "neutral",
          },
          severity: "warning",
        }),
      });
      continue;
    }

    zoneStates.push({
      zone,
      level: "light",
      consecutiveSignals,
      zoneBlocked: false,
      referralRequired: false,
      autoAdaptationAllowed: true,
      trace: traceFactory.make({
        ruleId: RULE_IDS.painLight,
        ruleVersion: RULE_VERSION,
        category: "pain",
        isHardGuardrail: false,
        scope: "pain_zone",
        scopeRefId: null,
        scopeRefDate: latest.loggedDate,
        conditionExpr: "pain = 'light' (or isolated 'pain' below persistence threshold)",
        inputsUsed: [{ source: "session_logs", sourceId: latest.id, field: "pain", value: latest.pain, observedOn: latest.loggedDate }],
        output: { field: "pain_protocol_level", before: existing?.level ?? "none", after: "light", direction: "neutral" },
        severity: "info",
      }),
    });
  }

  // Épisodes déjà ouverts (persistent/acute) sans nouveau signal cette fois : ils restent
  // actifs tant qu'ils ne sont pas explicitement résolus (résolution hors périmètre moteur pur).
  for (const episode of context.painEpisodes) {
    if (episode.resolvedAt !== null) continue;
    if (handledZones.has(episode.zone)) continue;
    if (episode.level !== "persistent" && episode.level !== "acute") continue;

    zoneStates.push({
      zone: episode.zone,
      level: episode.level,
      consecutiveSignals: episode.consecutiveSignals,
      zoneBlocked: true,
      referralRequired: true,
      autoAdaptationAllowed: episode.level !== "acute",
      trace: traceFactory.make({
        ruleId: episode.level === "acute" ? RULE_IDS.painAcute : RULE_IDS.painPersistent,
        ruleVersion: RULE_VERSION,
        category: "pain",
        isHardGuardrail: true,
        scope: "pain_zone",
        scopeRefId: null,
        scopeRefDate: episode.lastSignalOn,
        conditionExpr: "episode already open, carried forward (no new signal this run)",
        inputsUsed: [
          {
            source: "pain_episodes",
            sourceId: null,
            field: "level",
            value: episode.level,
            observedOn: episode.lastSignalOn,
          },
        ],
        output: { field: "pain_protocol_level", before: episode.level, after: episode.level, direction: "neutral" },
        severity: episode.level === "acute" ? "critical" : "warning",
      }),
    });
  }

  return { zoneStates };
}
