import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { createSupabaseServiceRoleClient } from "@hybride/db/server";

import { readObjectiveEndOffer } from "@/lib/orchestration/read-objective-end-offer";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Ton objectif est arrivé à échéance — Hybride Club" };
export const dynamic = "force-dynamic";

/**
 * `ObjectiveEndPage` — AC14 : écran de transition. Deux propositions explicites, jamais un vide
 * (`readObjectiveEndOffer()`). Simplification assumée de ce lot (voir rapport de fin de lot) :
 * les deux choix sont de simples liens de navigation plutôt qu'une nouvelle machine de décision
 * serveur — « nouvel objectif » renvoie vers l'onboarding conversationnel déjà construit (Lot L3,
 * capable de recueillir un nouvel objectif), « transition/récupération » confirme le plan de
 * transition déjà matérialisé automatiquement par `runObjectiveCheck()` (cron quotidien), déjà
 * actif au moment où cet écran s'affiche.
 */
export default async function ObjectiveEndPage() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createSupabaseServiceRoleClient();
  const offer = await readObjectiveEndOffer(admin, user.id);

  if (offer.status === "active") {
    redirect("/dashboard");
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-5 py-8">
      <h1 className="font-serif text-title text-foreground" data-testid="objective-end-title">
        Ton objectif est arrivé à échéance
      </h1>
      <p className="text-body text-foreground-muted" data-testid="objective-end-explanation">
        {offer.explanation.short}
      </p>

      <div className="flex flex-col gap-4">
        {offer.proposals.map((proposal) => (
          <div key={proposal.kind} className="rounded-lg bg-surface p-4" data-testid={`objective-end-proposal-${proposal.kind}`}>
            <p className="font-medium text-foreground">{proposal.label}</p>
            <p className="mt-1 text-body text-foreground-muted">{proposal.rationale}</p>
            <Link
              href={proposal.kind === "new_objective" ? "/onboarding/chat" : "/dashboard"}
              className="mt-2 inline-block text-body-strong font-semibold text-accent underline underline-offset-2"
              data-testid={`objective-end-cta-${proposal.kind}`}
            >
              {proposal.kind === "new_objective" ? "Définir mon nouvel objectif" : "Continuer avec ce plan"}
            </Link>
          </div>
        ))}
      </div>
    </main>
  );
}
