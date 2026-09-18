/**
 * Libellés français des disciplines, indexés par `sports.code` (seed `0021_seed_data_sources.sql`
 * et amont). Jusqu'ici l'app affichait le code brut nettoyé de ses underscores
 * (`session-detail.tsx` : `sportCode.replace(/_/g, " ")`), ce qui rendait « strength training »
 * ou « trail running » en anglais au milieu d'une interface française.
 *
 * Le repli reste ce nettoyage, avec une capitale : un code inconnu — un sport déclaré librement
 * par l'utilisateur via `S-offplan-block`, par exemple — reste affichable sans être bloquant.
 */
const SPORT_LABELS: Record<string, string> = {
  climbing: "Escalade",
  crossfit: "CrossFit",
  cycling: "Vélo",
  dance: "Danse",
  football: "Football",
  hiking: "Randonnée",
  mountain_biking: "VTT",
  rowing: "Aviron",
  running: "Course",
  strength_training: "Renforcement",
  swimming: "Natation",
  tennis: "Tennis",
  trail_running: "Trail",
  triathlon: "Triathlon",
  yoga_pilates: "Yoga / Pilates",
};

export function sportLabel(code: string | null): string | null {
  if (!code) return null;
  const known = SPORT_LABELS[code];
  if (known) return known;
  const cleaned = code.replace(/[_-]+/g, " ").trim();
  return cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : null;
}
