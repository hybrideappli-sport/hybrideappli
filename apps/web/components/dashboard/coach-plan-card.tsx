import Link from "next/link";
import type { TodaySessionView } from "@hybride/domain";

import { ExplanationInline } from "@/components/coach/explanation-inline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardLabel, CardTitle } from "@/components/ui/card";
import { sportLabel } from "@/lib/sport-labels";

const SESSION_TYPE_LABELS: Record<string, string> = {
  endurance: "Endurance",
  tempo: "Tempo",
  interval: "Fractionné",
  long: "Sortie longue",
  strength: "Renforcement",
  power: "Puissance",
  mobility: "Mobilité",
  technique: "Technique",
  cross_training: "Cross-training",
  rest: "Repos",
};

/** `intensity_zone` ne vaut que `high`, `moderate` ou `null` (`09-build-sessions.ts`). Il n'existe
 *  aucune cible RPE en base : le badge « RPE cible 7 » de la maquette n'avait pas de donnée
 *  derrière, il est remplacé par l'intensité réellement prescrite (arbitrage du 2026-09-18). */
const INTENSITY_LABELS: Record<string, string> = {
  high: "Intensité soutenue",
  moderate: "Intensité modérée",
};

/**
 * `D-coach-card` — AC1 : plan du jour du coach IA, en premier et mis en avant.
 *
 * La bordure accent était revendiquée dans deux commentaires (`page.tsx` et ici) et rendue nulle
 * part : `Card` ne pose ni bordure ni ombre. La carte censée être « mise en avant » était
 * visuellement identique aux trois autres. Elle est désormais réellement dessinée
 * (`stroke: $primary` dans `jSZB0`).
 *
 * Trois éléments de la maquette manquaient aussi : la ligne de badges méta, le bloc imbriqué
 * « POURQUOI CETTE SÉANCE », et le CTA en pill plein — le code se contentait d'un lien souligné.
 *
 * La nutrition a quitté cette carte pour la sienne (`NutritionCard`) : la maquette en fait deux
 * objets distincts, et les macros n'étaient de toute façon pas affichées.
 */
export async function CoachPlanCard({ session }: { session: TodaySessionView | null }) {
  const discipline = session ? await sportLabel(session.sportCode) : null;
  const intensity = session?.intensityZone ? INTENSITY_LABELS[session.intensityZone] : null;

  return (
    <Card className="border border-accent" data-testid="coach-plan-card">
      <CardHeader className="gap-2">
        <CardLabel tone="accent">Plan du jour · Coach IA</CardLabel>
        <CardTitle>
          {session
            ? (SESSION_TYPE_LABELS[session.sessionType] ?? session.sessionType)
            : "Jour de repos."}
        </CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {session ? (
          <>
            {/* `D-coach-meta` — charte §4.5. Les badges absents sont simplement omis : une séance
                sans durée ni zone d'intensité ne laisse pas d'emplacement vide. */}
            {session.durationMin || intensity || discipline ? (
              <div className="flex flex-wrap gap-2" data-testid="coach-meta">
                {session.durationMin ? <Badge>{session.durationMin} min</Badge> : null}
                {intensity ? <Badge>{intensity}</Badge> : null}
                {discipline ? <Badge>{discipline}</Badge> : null}
              </div>
            ) : null}

            {/* `D-why` — bloc imbriqué, charte §4.3 : `surface-raised`, `radius-md`, padding 16. */}
            <div className="flex flex-col gap-2 rounded-md bg-surface-raised p-4" data-testid="coach-why">
              <p className="text-label text-foreground-subtle">Pourquoi cette séance</p>
              <ExplanationInline
                short={session.explanation.short}
                explanationId={session.explanation.explanationId}
              />
            </div>
          </>
        ) : (
          <p className="text-body text-foreground-muted" data-testid="dashboard-rest-day">
            Aucune séance prévue aujourd&apos;hui — jour de repos.
          </p>
        )}

        {/* `11-design-notes.md` §2.3 — le libellé bascule quand rien n'est prévu : c'est le point
            d'entrée du Cas B, `S-offplan-block` déplié d'emblée sur `/aujourdhui` (AC3). */}
        <Button asChild className="w-full">
          <Link href="/aujourdhui" data-testid="coach-plan-cta">
            {session === null ? "Enregistrer une séance" : "Voir ma séance du jour"}
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
