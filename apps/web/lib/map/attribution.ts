/**
 * Attribution ODbL (ADR-018 §9) — obligation de licence, pas un élément décoratif. Chaîne exacte en
 * constante UNIQUE, injectée dans `maplibregl.AttributionControl` via `customAttribution` (donc
 * garantie visible même si le style distant n'a pas encore fini de charger — voir
 * `components/map/map-canvas.tsx`), et vérifiée par test E2E (`e2e/carte.spec.ts`) : sa présence
 * dans le DOM ne doit jamais dépendre de la vigilance d'un futur refactor de l'UI.
 */
export const MAP_ATTRIBUTION_TEXT = "© les contributeurs d'OpenStreetMap · © Stadia Maps";
