/**
 * Critère d'acceptation L3 (ADR-018) : « décocher une pastille filtre les tracés SANS AUCUNE
 * requête réseau ». `buildTrailRenderFeatureCollection` prouve déjà la partie « filtre les tracés »
 * (`trail-render-source.test.ts`) ; ce fichier couvre la partie « sans requête réseau », qui
 * n'était vérifiée par aucun test nommé avant ce correctif.
 *
 * Même patron que `overpass-url-single-module.test.ts` / `no-connection-dependency.test.ts` :
 * vérification STRUCTURELLE plutôt qu'un rendu React (le dépôt n'a pas `@testing-library/react`
 * en dépendance — voir note de tête de `map-canvas.tsx`/`use-active-filters.ts`). On prouve que la
 * chaîne complète du toggle — bouton de pastille → callback → hook d'état → persistance — ne
 * contient, TEXTUELLEMENT, aucune référence à `fetch`, à `useTrailsFetch` ou à la route
 * `/api/v1/map/trails` : la garantie n'est donc pas « ça n'appelle rien en pratique aujourd'hui »
 * mais « ça ne PEUT PAS appeler quoi que ce soit sans que ce test le voie ».
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const NETWORK_REFERENCE_PATTERN = /\bfetch\s*\(|useTrailsFetch|\/api\/v1\/map\/trails/;

const FILTER_TOGGLE_CHAIN = [
  path.resolve(import.meta.dirname, "filters-storage.ts"), // toggleActiveFilter — logique pure
  path.resolve(import.meta.dirname, "use-active-filters.ts"), // hook d'état + persistance localStorage
  path.resolve(import.meta.dirname, "../../components/map/filter-pills.tsx"), // pastilles, déclenche onToggle
];

describe("Décocher une pastille ne peut PAS déclencher de requête réseau (ADR-018, critère L3 n°1)", () => {
  it("a bien résolu les trois fichiers de la chaîne pastille → toggle → persistance", () => {
    for (const file of FILTER_TOGGLE_CHAIN) {
      expect(() => readFileSync(file, "utf-8")).not.toThrow();
    }
  });

  it.each(FILTER_TOGGLE_CHAIN)("%s ne référence ni fetch(), ni useTrailsFetch, ni /api/v1/map/trails", (file) => {
    const content = readFileSync(file, "utf-8");
    expect(content).not.toMatch(NETWORK_REFERENCE_PATTERN);
  });

  it("useActiveFilters n'importe aucun module réseau (aucun import de use-trails-fetch)", () => {
    const content = readFileSync(path.resolve(import.meta.dirname, "use-active-filters.ts"), "utf-8");
    expect(content).not.toMatch(/from\s+["']\.\/use-trails-fetch["']/);
  });
});
