import type { Metadata } from "next";
import Link from "next/link";

import { createSupabaseServiceRoleClient } from "@hybride/db/server";

import { OptionalBlock } from "@/components/data/optional-block";
import { SourceCard } from "@/components/data/source-card";
import { Button } from "@/components/ui/button";
import { fetchDataSources } from "@/lib/data/fetch-data-sources";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Connexion données — Hybride Club" };
export const dynamic = "force-dynamic";

/**
 * `/donnees` — AC1, AC2, AC10 (`09-design-feature2-notes.md` §3). Sous-écran, `✕` de fermeture,
 * PAS de tab bar (patron du sous-écran Abonnement). La dernière phrase de l'en-tête éditorial porte
 * visuellement l'AC9 dès le premier écran : la connexion enrichit, elle ne conditionne jamais.
 */
export default async function DataSourcesPage() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null; // `(app)/layout.tsx` redirige déjà — défense en profondeur uniquement.

  const admin = createSupabaseServiceRoleClient();
  const { sources } = await fetchDataSources(admin, user.id);

  return (
    <main className="mx-auto flex max-w-md flex-col">
      <header className="flex h-14 items-center justify-between bg-surface-sunken px-5">
        <p className="text-label text-foreground-muted">CONNEXION DONNÉES</p>
        <Link href="/dashboard" aria-label="Fermer" className="flex size-11 items-center justify-center text-foreground-muted hover:text-foreground">
          <span aria-hidden="true">✕</span>
        </Link>
      </header>

      <div className="flex flex-col gap-6 px-5 py-8">
        <div className="flex flex-col gap-3">
          <p className="text-label text-foreground-subtle">MES SOURCES DE DONNÉES</p>
          <h1 className="font-serif text-display text-foreground">Tes données, réunies.</h1>
          <p className="text-body text-foreground-muted">
            Connecte ce qui peut l&apos;être, déclare le reste. Rien n&apos;est obligatoire : ton plan du jour fonctionne déjà sans.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          {sources.map((source) => (
            <SourceCard key={source.code} source={source} />
          ))}
        </div>

        <OptionalBlock />

        <div className="flex flex-col items-center gap-3">
          <Button asChild className="w-full">
            <Link href="/dashboard" data-testid="donnees-continue">
              Continuer
            </Link>
          </Button>
          <Link href="/dashboard" className="text-button font-semibold text-foreground-muted hover:text-foreground">
            Plus tard
          </Link>
          <p className="text-center text-caption text-foreground-subtle">
            Tu peux connecter ou retirer une source à tout moment depuis ton compte.
          </p>
        </div>
      </div>
    </main>
  );
}
