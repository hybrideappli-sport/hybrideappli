import "server-only";

import { cache } from "react";

import { getSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Libellés français des disciplines, lus dans `sports.label_fr` — la colonne existe depuis la
 * migration `0003` et le référentiel est seedé par `0010`.
 *
 * Ce module a d'abord été une table en dur (2026-09-18, introduite avec l'alignement du Dashboard).
 * Elle a dérivé de la base le jour même : la table disait `running → "Course"` là où
 * `sports.label_fr` dit « Course à pied ». Deux sources pour la même information, déjà en désaccord
 * — d'où ce passage à la lecture, la seule qui fasse foi.
 *
 * ⚠️ UTILISABLE EN CONTEXTE DE REQUÊTE UNIQUEMENT. `getSupabaseServerClient()` lit les cookies ;
 * appelé depuis un job ou un orchestrateur sans requête, ce module lève « `cookies` was called
 * outside a request scope ». Un appelant serveur hors requête doit lire `sports.label_fr` par sa
 * propre jointure — voir `run-debrief-turn.ts`, qui le fait.
 *
 * `cache()` de React : une seule requête par rendu de requête, quel que soit le nombre de
 * composants qui demandent un libellé. Le référentiel tient en quinze lignes et il est lisible par
 * tout utilisateur authentifié (`sports_read … using (true)`), donc via le client RLS et non
 * `service_role`.
 */
const getSportLabels = cache(async (): Promise<Map<string, string>> => {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.from("sports").select("code, label_fr");

  // Un référentiel illisible ne doit pas faire échouer un écran : on retombe sur le formatage du
  // code, exactement comme pour une discipline absente du référentiel.
  if (error) {
    console.error("[sport-labels] référentiel illisible, repli sur le formatage du code :", error.message);
    return new Map();
  }

  return new Map((data ?? []).map((row) => [row.code, row.label_fr]));
});

/**
 * Formatage de repli : `trail_running` → « Trail running ».
 *
 * Sert deux cas. Une discipline absente du référentiel, et — plus fréquent — une discipline créée
 * à l'exécution par `resolveOrCreateSport()`, qui pose `label_fr = code` faute de libellé transmis.
 * Sans ce repli, l'interface afficherait le code brut avec ses underscores.
 */
function formatCode(code: string): string {
  const cleaned = code.replace(/[_-]+/g, " ").trim();
  return cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : code;
}

/** Libellé d'une discipline, ou `null` si aucun code n'est renseigné. */
export async function sportLabel(code: string | null): Promise<string | null> {
  if (!code) return null;
  const labels = await getSportLabels();
  const known = labels.get(code);
  // `label_fr === code` : ligne créée à l'exécution, sans vrai libellé. Traitée comme une absence.
  return known && known !== code ? known : formatCode(code);
}

/** Variante pour un appelant qui a plusieurs codes à résoudre — une seule lecture pour tous. */
export async function sportLabelsFor(codes: readonly (string | null)[]): Promise<Map<string, string>> {
  const labels = await getSportLabels();
  const resolved = new Map<string, string>();
  for (const code of codes) {
    if (!code) continue;
    const known = labels.get(code);
    resolved.set(code, known && known !== code ? known : formatCode(code));
  }
  return resolved;
}
