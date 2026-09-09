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

    // `toBeVisible()` ne regarde que `display`/`visibility`/`opacity` et la taille : il a laissé
    // passer une attribution rendue EN BLANC SUR BLANC (MapLibre pose un fond blanc à 50 % sans
    // définir de couleur de texte hors variante `compact` ; notre `customAttribution`, texte brut
    // et non lien, héritait donc du blanc de l'application). L'obligation ODbL porte sur la
    // LISIBILITÉ, pas sur la présence dans le DOM : on vérifie donc le contraste effectif.
    const contrast = await attribution.evaluate((node) => {
      const parse = (value: string) => (value.match(/[\d.]+/g) ?? []).map(Number);
      // Luminance relative WCAG, en supposant l'élément composé sur un fond blanc (le fond du
      // contrôle est lui-même clair et semi-transparent).
      const luminance = ([r, g, b]: number[]) => {
        const channel = (c: number) => {
          const s = c / 255;
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
      };
      const composite = (fg: number[], bg: number[]) => {
        const alpha = fg[3] ?? 1;
        return [0, 1, 2].map((i) => fg[i] * alpha + bg[i] * (1 - alpha));
      };
      const style = getComputedStyle(node);
      const inner = node.querySelector(".maplibregl-ctrl-attrib-inner") ?? node;
      const bg = composite(parse(style.backgroundColor), [255, 255, 255]);
      const fg = composite(parse(getComputedStyle(inner).color), bg);
      const [lighter, darker] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
      return (lighter + 0.05) / (darker + 0.05);
    });

    // Seuil WCAG AA pour du petit texte. Sans le correctif de `components/map/map-canvas.css`,
    // ce rapport vaut 1 (blanc sur blanc) et l'assertion échoue.
    expect(contrast).toBeGreaterThanOrEqual(4.5);

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
