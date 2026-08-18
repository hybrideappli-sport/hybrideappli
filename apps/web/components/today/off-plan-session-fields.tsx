"use client";

import { X } from "lucide-react";
import type { SessionType } from "@hybride/domain";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * `S-offplan-block` — `11-design-notes.md` §2.1 : « une muscu non planifiée n'a aujourd'hui aucun
 * moyen d'être enregistrée » (AC3). Réutilisé identique dans les deux cas d'usage : `mode="trigger"`
 * (Cas A — repliable, à côté d'une séance prévue) et `mode="expanded"` (Cas B — toujours déplié,
 * jour de repos ou séance déjà enregistrée, pas de `✕`).
 *
 * Simplification assumée par rapport à la note de design : le champ « Autre discipline » est un
 * champ texte libre (converti en code `sports.code`) plutôt qu'un `<select>` alimenté par le
 * référentiel `sports` — aucune route ne liste aujourd'hui ce référentiel côté client, et
 * `resolveOrCreateSport()` (`ADR-015`, onboarding) accepte déjà tout code inédit. À corriger si un
 * jour une route `GET /sports` existe.
 */

export type DisciplineChoice = "strength_training" | "running" | "cycling" | "other" | "";
export type DurationChoice = "30" | "45" | "60" | "90" | "other" | "";

const DISCIPLINE_OPTIONS: { value: Exclude<DisciplineChoice, "">; label: string }[] = [
  { value: "strength_training", label: "Musculation" },
  { value: "running", label: "Course" },
  { value: "cycling", label: "Vélo" },
  { value: "other", label: "Autre" },
];

const TYPE_OPTIONS: { value: SessionType; label: string }[] = [
  { value: "endurance", label: "Endurance" },
  { value: "interval", label: "Intensité" },
  { value: "strength", label: "Force" },
  { value: "mobility", label: "Mobilité" },
];

const DURATION_OPTIONS: { value: Exclude<DurationChoice, "">; label: string }[] = [
  { value: "30", label: "30" },
  { value: "45", label: "45" },
  { value: "60", label: "60" },
  { value: "90", label: "90 min" },
  { value: "other", label: "Autre" },
];

const CHIP_BASE = "flex h-11 min-w-11 items-center justify-center rounded-full px-5 text-body-strong font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const CHIP_SELECTED = "bg-accent text-on-accent";
const CHIP_UNSELECTED = "bg-transparent text-foreground-muted hover:text-foreground";

function ChipRow<TValue extends string>({
  legendId,
  legend,
  options,
  value,
  onChange,
}: {
  legendId: string;
  legend: string;
  options: { value: TValue; label: string }[];
  value: TValue | "";
  onChange: (value: TValue) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label id={legendId}>{legend}</Label>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby={legendId}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(option.value)}
              className={cn(CHIP_BASE, selected ? CHIP_SELECTED : CHIP_UNSELECTED)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export interface OffPlanFieldsState {
  discipline: DisciplineChoice;
  otherSportCode: string;
  sessionType: SessionType;
  duration: DurationChoice;
  otherDurationMin: string;
  startedAtTime: string;
}

export const EMPTY_OFF_PLAN_STATE: OffPlanFieldsState = {
  discipline: "",
  otherSportCode: "",
  sessionType: "endurance",
  duration: "",
  otherDurationMin: "",
  startedAtTime: "",
};

/** AC3 — résout l'état du bloc en payload API, ou `null` si Discipline/Durée manquent encore. */
export function resolveOffPlanPayload(state: OffPlanFieldsState): { sportCode: string; sessionType: SessionType; actualDurationMin: number; startedAt?: string } | null {
  const sportCode = state.discipline === "other" ? state.otherSportCode.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-") : state.discipline;
  if (!sportCode) return null;

  const durationMin = state.duration === "other" ? Number.parseInt(state.otherDurationMin, 10) : state.duration ? Number.parseInt(state.duration, 10) : NaN;
  if (!Number.isFinite(durationMin) || durationMin <= 0) return null;

  return { sportCode, sessionType: state.sessionType, actualDurationMin: durationMin };
}

export function OffPlanSessionFields({
  mode,
  state,
  onChange,
  onDismiss,
  error,
  idPrefix,
}: {
  mode: "trigger" | "expanded";
  state: OffPlanFieldsState;
  onChange: (next: OffPlanFieldsState) => void;
  onDismiss?: () => void;
  error?: string | null;
  idPrefix: string;
}) {
  function handleDisciplineChange(value: Exclude<DisciplineChoice, "">) {
    // §2.1 point 3 — « Force » par défaut si la discipline est Musculation, tant que l'utilisateur
    // n'a pas lui-même choisi un autre type.
    const nextSessionType = value === "strength_training" && state.sessionType === "endurance" ? "strength" : state.sessionType;
    onChange({ ...state, discipline: value, sessionType: nextSessionType });
  }

  return (
    <div className="flex flex-col gap-3 rounded-md bg-surface-raised p-4" data-testid="off-plan-block">
      <div className="flex items-center justify-between">
        <p className="text-label uppercase tracking-[0.14em] text-foreground-subtle">Séance hors plan</p>
        {mode === "trigger" && onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Annuler cette séance hors plan"
            className="flex size-11 items-center justify-center text-foreground-subtle hover:text-foreground"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        ) : null}
      </div>

      <ChipRow
        legendId={`${idPrefix}-discipline-label`}
        legend="Discipline"
        options={DISCIPLINE_OPTIONS}
        value={state.discipline}
        onChange={handleDisciplineChange}
      />

      {state.discipline === "other" ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${idPrefix}-other-discipline`}>Précise ta discipline</Label>
          <Input
            id={`${idPrefix}-other-discipline`}
            className="bg-surface"
            value={state.otherSportCode}
            onChange={(e) => onChange({ ...state, otherSportCode: e.target.value })}
            placeholder="Ex. natation, escalade…"
          />
        </div>
      ) : null}

      <ChipRow legendId={`${idPrefix}-type-label`} legend="Type" options={TYPE_OPTIONS} value={state.sessionType} onChange={(v) => onChange({ ...state, sessionType: v })} />

      <ChipRow
        legendId={`${idPrefix}-duration-label`}
        legend="Durée"
        options={DURATION_OPTIONS}
        value={state.duration}
        onChange={(v) => onChange({ ...state, duration: v })}
      />

      {state.duration === "other" ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${idPrefix}-other-duration`}>Durée en minutes</Label>
          <Input
            id={`${idPrefix}-other-duration`}
            className="bg-surface"
            type="number"
            inputMode="numeric"
            min={1}
            max={1440}
            value={state.otherDurationMin}
            onChange={(e) => onChange({ ...state, otherDurationMin: e.target.value })}
          />
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${idPrefix}-started-at`}>Début</Label>
        <Input
          id={`${idPrefix}-started-at`}
          className="bg-surface"
          type="time"
          value={state.startedAtTime}
          onChange={(e) => onChange({ ...state, startedAtTime: e.target.value })}
        />
      </div>

      <p className="text-small text-foreground-subtle">Je la compte en plus de ton plan, sans rien décaler.</p>

      {error ? (
        <p role="alert" className="text-small text-danger" id={`${idPrefix}-error`}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
