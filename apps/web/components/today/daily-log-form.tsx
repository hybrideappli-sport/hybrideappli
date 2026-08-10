"use client";

import { useState, type FormEvent } from "react";
import { ADHERENCE_LEVELS, BODY_ZONES, COMPLETION_STATUSES, PAIN_LEVELS } from "@hybride/domain";
import type { AdherenceLevel, BodyZone, CompletionStatus, CreateSessionLogResponse, PainLevel } from "@hybride/domain";

import { Button } from "@/components/ui/button";
import { AdjustmentFeedback } from "./adjustment-feedback";

const COMPLETION_LABELS: Record<CompletionStatus, string> = { done: "Réalisée", partial: "Partiellement réalisée", not_done: "Non réalisée" };
const PAIN_LABELS: Record<PainLevel, string> = { none: "Aucune gêne", light: "Gêne légère", pain: "Douleur" };
const ADHERENCE_LABELS: Record<AdherenceLevel, string> = { low: "Faible", partial: "Partielle", high: "Bonne" };
const ZONE_LABELS: Record<BodyZone, string> = Object.fromEntries(BODY_ZONES.map((zone) => [zone, zone.replace(/_/g, " ")])) as Record<
  BodyZone,
  string
>;

/**
 * `DailyLogForm` — AC4 : 4 signaux entraînement (réalisation, RPE, fraîcheur, douleur) + 2 signaux
 * nutrition (adhérence, énergie), pour rester rapide à remplir. `painAtRest` (AC9 niveau 3) est la
 * question CONDITIONNELLE ajoutée par `architect` (R7 du plan) : affichée UNIQUEMENT si
 * `pain = 'pain'`, jamais si `pain = 'light'`.
 */
export function DailyLogForm({ plannedSessionId, loggedDate }: { plannedSessionId: string | null; loggedDate: string }) {
  const [completion, setCompletion] = useState<CompletionStatus>("done");
  const [rpe, setRpe] = useState(5);
  const [freshness, setFreshness] = useState(3);
  const [pain, setPain] = useState<PainLevel>("none");
  const [painZone, setPainZone] = useState<BodyZone | "">("");
  const [painAtRest, setPainAtRest] = useState(false);
  const [adherence, setAdherence] = useState<AdherenceLevel>("high");
  const [energy, setEnergy] = useState(3);

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreateSessionLogResponse | null>(null);

  function handlePainChange(value: PainLevel) {
    setPain(value);
    if (value === "none") {
      setPainZone("");
      setPainAtRest(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const sessionLogResponse = await fetch("/api/v1/session-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plannedSessionId,
          loggedDate,
          completion,
          rpe,
          freshness,
          pain,
          ...(pain !== "none" && painZone ? { painZone } : {}),
          ...(pain === "pain" ? { painAtRest } : {}),
        }),
      });
      const sessionBody = (await sessionLogResponse.json().catch(() => null)) as CreateSessionLogResponse | { error: { message: string } } | null;
      if (!sessionLogResponse.ok) {
        throw new Error((sessionBody as { error?: { message: string } } | null)?.error?.message ?? "Impossible d'enregistrer ta séance pour le moment.");
      }

      // AC11 — saisie légère nutrition, best-effort : un échec de ce second appel n'invalide pas
      // l'enregistrement (déjà réussi) de la séance, qui porte l'essentiel de l'ajustement AC4.
      await fetch("/api/v1/nutrition-checkins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: loggedDate, adherence, energy }),
      }).catch(() => undefined);

      // Pas de `router.refresh()` ici : `AdjustmentFeedback` (état local `result`) EST le retour
      // immédiat AC4 — un rafraîchissement serveur immédiat remplacerait cet affichage par l'état
      // « déjà enregistré aujourd'hui » (`session.log` désormais non nul) avant que l'utilisateur
      // n'ait pu le lire. La page se resynchronise naturellement à la prochaine navigation
      // (`dynamic = 'force-dynamic'` sur `TodayPage`).
      setResult(sessionBody as CreateSessionLogResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue.");
    } finally {
      setPending(false);
    }
  }

  if (result) {
    return <AdjustmentFeedback result={result} painZone={pain !== "none" && painZone ? painZone : null} />;
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-lg border border-neutral-200 bg-white p-4" data-testid="daily-log-form">
      <div className="flex flex-col gap-1">
        <label htmlFor="completion" className="text-sm font-medium">
          Séance réalisée ?
        </label>
        <select
          id="completion"
          value={completion}
          onChange={(e) => setCompletion(e.target.value as CompletionStatus)}
          className="rounded-md border border-neutral-300 p-2 text-sm"
        >
          {COMPLETION_STATUSES.map((status) => (
            <option key={status} value={status}>
              {COMPLETION_LABELS[status]}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="rpe" className="text-sm font-medium">
          Effort ressenti (RPE, 1 à 10)
        </label>
        <input
          id="rpe"
          type="number"
          min={1}
          max={10}
          value={rpe}
          onChange={(e) => setRpe(Number(e.target.value))}
          className="rounded-md border border-neutral-300 p-2 text-sm"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="freshness" className="text-sm font-medium">
          Fraîcheur / sommeil (1 à 5)
        </label>
        <input
          id="freshness"
          type="number"
          min={1}
          max={5}
          value={freshness}
          onChange={(e) => setFreshness(Number(e.target.value))}
          className="rounded-md border border-neutral-300 p-2 text-sm"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="pain" className="text-sm font-medium">
          Douleur ou gêne
        </label>
        <select
          id="pain"
          value={pain}
          onChange={(e) => handlePainChange(e.target.value as PainLevel)}
          className="rounded-md border border-neutral-300 p-2 text-sm"
        >
          {PAIN_LEVELS.map((level) => (
            <option key={level} value={level}>
              {PAIN_LABELS[level]}
            </option>
          ))}
        </select>
      </div>

      {pain !== "none" ? (
        <div className="flex flex-col gap-1">
          <label htmlFor="painZone" className="text-sm font-medium">
            Localisation
          </label>
          <select
            id="painZone"
            value={painZone}
            onChange={(e) => setPainZone(e.target.value as BodyZone)}
            className="rounded-md border border-neutral-300 p-2 text-sm"
            required
          >
            <option value="" disabled>
              Choisis une zone
            </option>
            {BODY_ZONES.map((zone) => (
              <option key={zone} value={zone}>
                {ZONE_LABELS[zone]}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {/* AC9 niveau 3 — question conditionnelle, UNIQUEMENT si "douleur" (pas "gêne légère"). */}
      {pain === "pain" ? (
        <div className="flex items-center gap-2">
          <input id="painAtRest" type="checkbox" checked={painAtRest} onChange={(e) => setPainAtRest(e.target.checked)} />
          <label htmlFor="painAtRest" className="text-sm">
            Cette douleur est-elle aussi présente au repos ?
          </label>
        </div>
      ) : null}

      <div className="flex flex-col gap-1 border-t border-neutral-100 pt-3">
        <label htmlFor="adherence" className="text-sm font-medium">
          Adhérence nutrition
        </label>
        <select
          id="adherence"
          value={adherence}
          onChange={(e) => setAdherence(e.target.value as AdherenceLevel)}
          className="rounded-md border border-neutral-300 p-2 text-sm"
        >
          {ADHERENCE_LEVELS.map((level) => (
            <option key={level} value={level}>
              {ADHERENCE_LABELS[level]}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="energy" className="text-sm font-medium">
          Énergie ressentie (1 à 5)
        </label>
        <input
          id="energy"
          type="number"
          min={1}
          max={5}
          value={energy}
          onChange={(e) => setEnergy(Number(e.target.value))}
          className="rounded-md border border-neutral-300 p-2 text-sm"
        />
      </div>

      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Enregistrement…" : "Enregistrer ma séance"}
      </Button>
    </form>
  );
}
