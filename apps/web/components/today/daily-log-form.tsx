"use client";

import { useRef, useState, type FormEvent } from "react";
import { ChevronDown, Check } from "lucide-react";
import { ADHERENCE_LEVELS, BODY_ZONES, COMPLETION_STATUSES, PAIN_LEVELS } from "@hybride/domain";
import type { AdherenceLevel, BodyZone, CompletionStatus, CreateSessionLogResponse, PainLevel } from "@hybride/domain";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AdjustmentFeedback } from "./adjustment-feedback";
import { EMPTY_OFF_PLAN_STATE, OffPlanSessionFields, resolveOffPlanPayload, type OffPlanFieldsState } from "./off-plan-session-fields";

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

export type DailyLogFormMode = "planned" | "offplan-only" | "correction";

interface DailyLogFormProps {
  /**
   * `"planned"` (défaut) — Cas A, `11-design-notes.md` §2.2 : une séance est prévue aujourd'hui
   * (`plannedSessionId` non nul), avec un lien tertiaire pour ajouter une séance hors plan EN PLUS.
   * `"offplan-only"` — Cas B, §2.3 : rien à rattacher (jour de repos, séance déjà enregistrée, ou
   * paywall qui masque le plan) — le bloc hors plan est déplié d'emblée, `Discipline`/`Durée`
   * requis, la question « Tu as fait la séance ? » disparaît (implicitement `done`).
   * `"correction"` — F3, §3.3 : corrige un `session_log` existant (`logId`), `PATCH` au lieu de
   * `POST`, question 1 pré-répondue « Oui ».
   */
  mode?: DailyLogFormMode;
  plannedSessionId: string | null;
  loggedDate: string;
  logId?: string;
}

export function DailyLogForm({ mode = "planned", plannedSessionId, loggedDate, logId }: DailyLogFormProps) {
  // Cas A uniquement : « Tu as fait la séance ? » porte sur la séance PRÉVUE (done/partial/not_done).
  // En correction, la question 1 est pré-répondue « Oui » (`11-design-notes.md` §3.3) — jamais
  // « not_done », c'est précisément ce que cet écran corrige. Aucun sélecteur : rien à choisir. En
  // Cas B (hors plan), la question n'a pas de sens (§2.3) : la séance décrite est par définition faite.
  const [completion, setCompletion] = useState<CompletionStatus>("done");
  const [rpe, setRpe] = useState(5);
  const [freshness, setFreshness] = useState(3);
  const [pain, setPain] = useState<PainLevel>("none");
  const [painZone, setPainZone] = useState<BodyZone | "">("");
  const [painAtRest, setPainAtRest] = useState(false);
  const [adherence, setAdherence] = useState<AdherenceLevel>("high");
  const [energy, setEnergy] = useState(3);

  const [offPlanOpen, setOffPlanOpen] = useState(mode === "offplan-only");
  const [offPlanState, setOffPlanState] = useState<OffPlanFieldsState>(EMPTY_OFF_PLAN_STATE);
  const [offPlanError, setOffPlanError] = useState<string | null>(null);

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreateSessionLogResponse | null>(null);
  const [offPlanSuccess, setOffPlanSuccess] = useState<string | null>(null);

  // Cas A — I1 : les deux `POST /session-logs` (séance prévue, puis hors plan) sont séquentiels.
  // Sans mémorisation, un retry après échec du second POST rejouerait aussi le premier, déjà
  // abouti côté serveur, et compterait deux fois la charge de la séance prévue (pas de contrainte
  // d'unicité sur `session_logs`). On retient donc ici, à travers les retries, celui des deux POST
  // qui a déjà réussi pour ne rejouer que celui qui a échoué.
  const plannedResultRef = useRef<CreateSessionLogResponse | null>(null);
  const offPlanDoneRef = useRef(false);

  function handlePainChange(value: PainLevel) {
    setPain(value);
    if (value === "none") {
      setPainZone("");
      setPainAtRest(false);
    }
  }

  function buildStartedAt(): string | undefined {
    if (!offPlanState.startedAtTime) return undefined;
    const parsed = new Date(`${loggedDate}T${offPlanState.startedAtTime}:00`);
    if (Number.isNaN(parsed.getTime())) return undefined;
    return parsed.toISOString();
  }

  async function postSessionLog(body: Record<string, unknown>): Promise<CreateSessionLogResponse> {
    const response = await fetch("/api/v1/session-logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const responseBody = (await response.json().catch(() => null)) as CreateSessionLogResponse | { error: { message: string } } | null;
    if (!response.ok) {
      throw new Error((responseBody as { error?: { message: string } } | null)?.error?.message ?? "Impossible d'enregistrer cette séance pour le moment.");
    }
    return responseBody as CreateSessionLogResponse;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setOffPlanError(null);

    // Discipline/Durée sont les DEUX seuls champs requis du bloc hors plan (§2.1 point 3) — quel
    // que soit le mode, dès que le bloc est ouvert/déplié.
    let offPlanPayload: ReturnType<typeof resolveOffPlanPayload> = null;
    if (offPlanOpen) {
      offPlanPayload = resolveOffPlanPayload(offPlanState);
      if (!offPlanPayload) {
        setOffPlanError("Il me faut au moins la discipline et la durée.");
        return;
      }
    }

    setPending(true);
    try {
      if (mode === "correction") {
        if (!logId) throw new Error("Identifiant de séance manquant pour la correction.");
        const response = await fetch(`/api/v1/session-logs/${logId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            completion: "done",
            rpe,
            freshness,
            pain,
            ...(pain !== "none" && painZone ? { painZone } : {}),
            ...(pain === "pain" ? { painAtRest } : {}),
          }),
        });
        const body = (await response.json().catch(() => null)) as CreateSessionLogResponse | { error: { message: string } } | null;
        if (!response.ok) {
          throw new Error((body as { error?: { message: string } } | null)?.error?.message ?? "La correction n'a pas pu être enregistrée.");
        }
        await fetch("/api/v1/nutrition-checkins", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date: loggedDate, adherence, energy }),
        }).catch(() => undefined);
        setResult(body as CreateSessionLogResponse);
      } else if (mode === "offplan-only") {
        const startedAt = buildStartedAt();
        const sessionResult = await postSessionLog({
          plannedSessionId: null,
          loggedDate,
          completion: "done",
          rpe,
          freshness,
          pain,
          ...(pain !== "none" && painZone ? { painZone } : {}),
          ...(pain === "pain" ? { painAtRest } : {}),
          sportCode: offPlanPayload!.sportCode,
          sessionType: offPlanPayload!.sessionType,
          actualDurationMin: offPlanPayload!.actualDurationMin,
          ...(startedAt ? { startedAt } : {}),
        });
        await fetch("/api/v1/nutrition-checkins", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date: loggedDate, adherence, energy }),
        }).catch(() => undefined);
        setResult(sessionResult);
      } else {
        // Cas A — la séance PRÉVUE (inchangé), puis, si le bloc hors plan est ouvert et complet,
        // une SECONDE séance en plus (§2.2 : « deux POST /session-logs »). I1 : chaque POST n'est
        // rejoué que s'il n'a pas déjà abouti lors d'une tentative précédente.
        if (!plannedResultRef.current) {
          plannedResultRef.current = await postSessionLog({
            plannedSessionId,
            loggedDate,
            completion,
            rpe,
            freshness,
            pain,
            ...(pain !== "none" && painZone ? { painZone } : {}),
            ...(pain === "pain" ? { painAtRest } : {}),
          });
        }
        const plannedResult = plannedResultRef.current;

        if (offPlanPayload && !offPlanDoneRef.current) {
          const startedAt = buildStartedAt();
          await postSessionLog({
            plannedSessionId: null,
            loggedDate,
            completion: "done",
            pain: "none",
            sportCode: offPlanPayload.sportCode,
            sessionType: offPlanPayload.sessionType,
            actualDurationMin: offPlanPayload.actualDurationMin,
            ...(startedAt ? { startedAt } : {}),
          });
          offPlanDoneRef.current = true;
          setOffPlanSuccess(`Séance hors plan de ${offPlanPayload.actualDurationMin} min enregistrée.`);
        }

        await fetch("/api/v1/nutrition-checkins", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date: loggedDate, adherence, energy }),
        }).catch(() => undefined);

        // Pas de `router.refresh()` ici : `AdjustmentFeedback` (état local `result`) EST le retour
        // immédiat AC4 — un rafraîchissement serveur immédiat remplacerait cet affichage par l'état
        // « déjà enregistré aujourd'hui » avant que l'utilisateur n'ait pu le lire.
        setResult(plannedResult);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue.");
    } finally {
      setPending(false);
    }
  }

  if (result) {
    return (
      <div className="flex flex-col gap-3">
        <AdjustmentFeedback result={result} painZone={pain !== "none" && painZone ? painZone : null} />
        {offPlanSuccess ? (
          <p role="status" aria-live="polite" className="text-small text-success" data-testid="off-plan-success">
            ✓ {offPlanSuccess}
          </p>
        ) : null}
      </div>
    );
  }

  // RPE / fraîcheur / douleur : requis dans les trois modes — y compris Cas B (hors plan),
  // `11-design-notes.md` §2.3 : « le RPE et la fraîcheur portent alors sur la séance hors plan qui
  // vient d'être décrite ». Ne jamais poster une valeur par défaut non saisie (cf. état initial
  // `rpe`/`freshness` ci-dessus) : ces questions doivent donc toujours être rendues.
  const signalsFields = (
    <>
      <div className="flex flex-col gap-2">
        <Label htmlFor="rpe">Effort ressenti (RPE, 1 à 10)</Label>
        <Input id="rpe" type="number" inputMode="numeric" min={1} max={10} value={rpe} onChange={(e) => setRpe(Number(e.target.value))} />
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
          <select id="pain" value={pain} onChange={(e) => handlePainChange(e.target.value as PainLevel)} className={SELECT_CLASSES}>
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
            <select id="painZone" value={painZone} onChange={(e) => setPainZone(e.target.value as BodyZone)} className={SELECT_CLASSES} required>
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
    </>
  );

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-lg bg-surface p-4" data-testid="daily-log-form">
      {mode === "correction" ? (
        <div className="flex flex-col gap-1" data-testid="correction-completion-notice">
          <Label>Tu as fait la séance ?</Label>
          <p className="text-body-strong font-semibold text-foreground">Oui</p>
          <p className="text-small text-foreground-subtle">Je l&apos;avais comptée comme non réalisée.</p>
        </div>
      ) : null}

      {mode === "planned" ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="completion">Séance réalisée ?</Label>
          <div className="relative">
            <select id="completion" value={completion} onChange={(e) => setCompletion(e.target.value as CompletionStatus)} className={SELECT_CLASSES}>
              {COMPLETION_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {COMPLETION_LABELS[status]}
                </option>
              ))}
            </select>
            <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-foreground-muted" />
          </div>
        </div>
      ) : null}

      {mode === "planned" || mode === "correction" ? signalsFields : null}

      {mode === "planned" ? (
        offPlanOpen ? (
          <OffPlanSessionFields mode="trigger" state={offPlanState} onChange={setOffPlanState} onDismiss={() => setOffPlanOpen(false)} error={offPlanError} idPrefix="offplan-a" />
        ) : (
          <button
            type="button"
            onClick={() => setOffPlanOpen(true)}
            aria-expanded={false}
            className="flex min-h-11 items-center text-small text-accent-text hover:text-accent-hover hover:underline"
            data-testid="off-plan-trigger"
          >
            + Enregistrer une séance hors plan
          </button>
        )
      ) : null}

      {mode === "offplan-only" ? (
        <>
          <OffPlanSessionFields mode="expanded" state={offPlanState} onChange={setOffPlanState} error={offPlanError} idPrefix="offplan-b" />
          {/* Cas B — `11-design-notes.md` §2.3 : le bloc hors plan est l'objet principal de l'écran,
              suivi de « TES SIGNAUX » (RPE/fraîcheur/douleur, questions 2 → 6 renumérotées 1 → 5). */}
          <p className="text-label uppercase tracking-[0.14em] text-foreground-subtle">Tes signaux · 20 secondes</p>
          {signalsFields}
        </>
      ) : null}

      <div className="flex flex-col gap-2 border-t border-border-subtle pt-4">
        <Label htmlFor="adherence">Adhérence nutrition</Label>
        <div className="relative">
          <select id="adherence" value={adherence} onChange={(e) => setAdherence(e.target.value as AdherenceLevel)} className={SELECT_CLASSES}>
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
        <Input id="energy" type="number" inputMode="numeric" min={1} max={5} value={energy} onChange={(e) => setEnergy(Number(e.target.value))} />
      </div>

      {error ? (
        <p role="alert" className="text-small text-danger">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={pending} loading={pending}>
        {pending ? "Enregistrement…" : mode === "correction" ? "Enregistrer la correction" : "Enregistrer ma séance"}
      </Button>
    </form>
  );
}
