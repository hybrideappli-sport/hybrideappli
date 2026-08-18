"use client";

import type { ConfirmedProfile } from "@hybride/domain";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ProfileRecapProps = {
  profile: ConfirmedProfile;
  onValidate: () => void;
  pending: boolean;
  error: string | null;
};

/** AC1 — l'utilisateur VALIDE son profil initial avant toute persistance (le LLM ne persiste jamais seul). */
export function ProfileRecap({ profile, onValidate, pending, error }: ProfileRecapProps) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-serif text-title text-foreground">Ton profil, avant de générer ton plan</h1>
      <p className="text-body text-foreground-muted">
        Vérifie ce que le coach a compris. Rien n&apos;est enregistré tant que tu n&apos;as pas validé.
      </p>

      <Card>
        <CardHeader>
          <CardTitle>Objectif</CardTitle>
        </CardHeader>
        <CardContent className="text-body text-foreground-muted">
          <p>{profile.objective.label || "Non précisé"}</p>
          {profile.objective.targetDate ? <p className="text-small">Date cible : {profile.objective.targetDate}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Niveau et historique</CardTitle>
        </CardHeader>
        <CardContent className="text-body text-foreground-muted">
          <p>Niveau : {profile.experienceLevel}</p>
          {profile.declaredWeeklySessions !== null ? <p>Séances/semaine : {profile.declaredWeeklySessions}</p> : null}
          {profile.declaredWeeklyHours !== null ? <p>Heures/semaine : {profile.declaredWeeklyHours}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sport(s) pratiqué(s)</CardTitle>
        </CardHeader>
        <CardContent className="text-body text-foreground-muted">
          {profile.sports.length === 0 ? (
            <p className="text-small">Aucun sport déclaré.</p>
          ) : (
            <ul className="list-inside list-disc">
              {profile.sports.map((sport) => (
                <li key={sport.sportCode}>
                  {sport.sportCode.replace(/_/g, " ")} ({sport.level}
                  {sport.isPrimary ? ", principal" : ""})
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {profile.riskFlags.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Profil à risque déclaré</CardTitle>
          </CardHeader>
          <CardContent className="text-body text-foreground-muted">
            <p>Le coach adaptera son comportement en conséquence (fiche AC3).</p>
          </CardContent>
        </Card>
      ) : null}

      {error ? (
        <p role="alert" className="text-small text-danger">
          {error}
        </p>
      ) : null}

      <Button onClick={onValidate} disabled={pending} loading={pending}>
        {pending ? "Génération de ton plan…" : "Valider mon profil et générer mon plan"}
      </Button>
    </div>
  );
}
