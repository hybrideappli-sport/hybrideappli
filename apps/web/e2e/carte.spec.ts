import { test, expect } from "@playwright/test";

import { completeOnboardingToDashboard } from "./support/daily-loop-flow";

/**
 * `carte.spec.ts` — ADR-018, lot L1 (« Socle carte »). Critères vérifiables du lot :
 *
 * - `/carte` est atteignable depuis `/planning`, et on en revient (question ouverte n°1, tranchée) ;
 * - `TAB_ITEMS` reste à 4 entrées, `/carte` n'affiche PAS la tab bar (sous-écran, patron `Yf6zY`) ;
 * - l'attribution ODbL est visible SANS interaction (§9) ;
 * - permission de géolocalisation refusée ⟹ état explicite, jamais un écran vide ;
 * - AUCUNE requête réseau ne part vers Overpass (aucun appel n'existe encore côté client — c'est
 *   L2 — donc cette assertion doit rester vraie par construction, pas par chance).
 *
 * Nécessite Supabase local démarré (voir `playwright.config.ts`, même patron que les autres specs
 * de ce dossier) et `MAP_TILES_STYLE_URL` positionnée pour le serveur de dev E2E (voir
 * `playwright.config.ts`, `webServer.env` — style de démonstration public MapLibre, distinct du
 * fournisseur Stadia de production, aucune clé requise).
 */
test.describe("Carte (ADR-018, lot L1)", () => {
  test("atteignable depuis /planning, sous-écran sans tab bar, attribution ODbL visible, fermeture vers /planning", async ({ page }) => {
    const overpassRequests: string[] = [];
    page.on("request", (request) => {
      const url = request.url();
      if (/overpass/i.test(url)) overpassRequests.push(url);
    });

    await completeOnboardingToDashboard(page, "carte-entry-point");

    await page.goto("/planning");
    const carteLink = page.getByTestId("planning-carte-link");
    await expect(carteLink).toBeVisible();
    await carteLink.click();

    await expect(page).toHaveURL(/\/carte$/);

    // Sous-écran (patron `Yf6zY`) : pas de tab bar sur `/carte`.
    await expect(page.getByTestId("tab-bar")).toHaveCount(0);

    // Attribution ODbL — visible SANS aucune interaction, jamais repliable (`compact: false`).
    const attribution = page.locator(".maplibregl-ctrl-attrib");
    await expect(attribution).toBeVisible();
    await expect(attribution).toContainText(/OpenStreetMap/);

    // Bouton flottant de recentrage présent.
    await expect(page.getByTestId("map-recenter-button")).toBeVisible();

    // Fermeture explicite : on revient sur `/planning`, jamais `/dashboard`.
    await page.getByTestId("carte-close-button").click();
    await expect(page).toHaveURL(/\/planning$/);

    // Aucune requête n'est jamais partie vers Overpass (L2 — hors périmètre de L1).
    expect(overpassRequests).toEqual([]);
  });

  test("TAB_ITEMS reste à 4 entrées sur un écran racine", async ({ page }) => {
    await completeOnboardingToDashboard(page, "carte-tabbar-untouched");
    await expect(page.getByTestId("tab-bar")).toBeVisible();
    await expect(page.locator('[data-testid^="tab-bar-item-"]')).toHaveCount(4);
  });

  test("permission de géolocalisation refusée : état explicite, jamais un écran vide", async ({ page, context }) => {
    // Chromium refuse `navigator.geolocation` par défaut tant qu'aucune permission n'est accordée
    // (`context.grantPermissions` non appelé) : reproduit fidèlement un refus utilisateur.
    await context.clearPermissions();

    await completeOnboardingToDashboard(page, "carte-geolocation-denied");
    await page.goto("/carte");

    await page.getByTestId("map-recenter-button").click();
    await expect(page.getByTestId("map-geolocation-error")).toBeVisible();
    await expect(page.getByTestId("map-geolocation-error")).toContainText(/localisation/i);
  });
});
