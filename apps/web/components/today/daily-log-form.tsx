"use client";

import { useState, type FormEvent } from "react";
import { ChevronDown, Check } from "lucide-react";
import { ADHERENCE_LEVELS, BODY_ZONES, COMPLETION_STATUSES, PAIN_LEVELS } from "@hybride/domain";
import type { AdherenceLevel, BodyZone, CompletionStatus, CreateSessionLogResponse, PainLevel } from "@hybride/domain";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AdjustmentFeedback } from "./adjustment-feedback";

// Boîte de sélection — docs/design-system.md §4.6 (« Select : même boîte + chevron
// `--color-foreground-muted` à droite »). Le `<select>` natif est conservé (comportement/tests
// inchangés, cf. `e2e/pain-acute.spec.ts` qui pilote ces champs via `selectOption`) : seule
// l'habillage visuel change.
const SELECT_CLASSES =
  "h-[52px] w-full appearance-none rounded-md border border-transparent bg-surface-raised px-4 pr-10 text-body text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent";

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
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-lg bg-surface p-4" data-testid="daily-log-form">
      <div className="flex flex-col gap-2">
        <Label htmlFor="completion">Séance réalisée ?</Label>
        <div className="relative">
          <select
            id="completion"
            value={completion}
            onChange={(e) => setCompletion(e.target.value as CompletionStatus)}
            className={SELECT_CLASSES}
          >
            {COMPLETION_STATUSES.map((status) => (
              <option key={status} value={status}>
                {COMPLETION_LABELS[status]}
              </option>
            ))}
          </select>
          <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-foreground-muted" />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="rpe">Effort ressenti (RPE, 1 à 10)</Label>
        <Input
          id="rpe"
          type="number"
          inputMode="numeric"
          min={1}
          max={10}
          value={rpe}
          onChange={(e) => setRpe(Number(e.target.value))}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="freshness">Fraîcheur / sommeil (1 à 5)</Label>
        <Input
          id="freshness"
          type="number"
          inputMode="numeric"
          min={1}
          max={5}
          value={freshness}
          onChange={(e) => setFreshness(Number(e.target.value))}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="pain">Douleur ou gêne</Label>
        <div className="relative">
          <select
            id="pain"
            value={pain}
            onChange={(e) => handlePainChange(e.target.value as PainLevel)}
            className={SELECT_CLASSES}
          >
            {PAIN_LEVELS.map((level) => (
              <option key={level} value={level}>
                {PAIN_LABELS[level]}
              </option>
            ))}
          </select>
          <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-foreground-muted" />
        </div>
      </div>

      {pain !== "none" ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="painZone">Localisation</Label>
          <div className="relative">
            <select
              id="painZone"
              value={painZone}
              onChange={(e) => setPainZone(e.target.value as BodyZone)}
              className={SELECT_CLASSES}
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
            <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-foreground-muted" />
          </div>
        </div>
      ) : null}

      {/* AC9 niveau 3 — question conditionnelle, UNIQUEMENT si "douleur" (pas "gêne légère"). */}
      {pain === "pain" ? (
        <label htmlFor="painAtRest" className="flex min-h-11 cursor-pointer items-center gap-3">
          <span className="relative flex size-6 shrink-0 items-center justify-center">
            <input
              id="painAtRest"
              type="checkbox"
              checked={painAtRest}
              onChange={(e) => setPainAtRest(e.target.checked)}
              className="peer size-6 shrink-0 appearance-none rounded-sm border-[1.5px] border-border-strong bg-transparent checked:border-accent checked:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
            />
            <Check aria-hidden="true" className="pointer-events-none absolute size-4 text-on-accent opacity-0 peer-checked:opacity-100" />
          </span>
          <span className="text-body text-foreground">Cette douleur est-elle aussi présente au repos ?</span>
        </label>
      ) : null}

      <div className="flex flex-col gap-2 border-t border-border-subtle pt-4">
        <Label htmlFor="adherence">Adhérence nutrition</Label>
        <div className="relative">
          <select
            id="adherence"
            value={adherence}
            onChange={(e) => setAdherence(e.target.value as AdherenceLevel)}
            className={SELECT_CLASSES}
          >
            {ADHERENCE_LEVELS.map((level) => (
              <option key={level} value={level}>
                {ADHERENCE_LABELS[level]}
              </option>
            ))}
          </select>
          <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-foreground-muted" />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="energy">Énergie ressentie (1 à 5)</Label>
        <Input
          id="energy"
          type="number"
          inputMode="numeric"
          min={1}
          max={5}
          value={energy}
          onChange={(e) => setEnergy(Number(e.target.value))}
        />
      </div>

      {error ? (
        <p role="alert" className="text-small text-danger">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={pending} loading={pending}>
        {pending ? "Enregistrement…" : "Enregistrer ma séance"}
      </Button>
    </form>
  );
}
