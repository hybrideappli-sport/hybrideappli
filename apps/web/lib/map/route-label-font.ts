/**
 * Résolution du `text-font` des étiquettes d'itinéraire — ADR-018, lot L3 ;
 * `docs/design-carte.md` §5.7.4 et §9.3.
 *
 * `text-font` doit nommer un font-stack RÉELLEMENT servi par l'endpoint `glyphs` du style chargé.
 * Un nom absent de ce jeu de glyphes (« Inter », une famille CSS…) fait disparaître l'étiquette
 * SILENCIEUSEMENT (§9.3) — aucune erreur, aucun avertissement, juste un texte qui ne se peint pas.
 *
 * Relevé le 2026-09-10 (même méthode que la source (b) de `docs/design-carte.md`, §0) sur le style
 * Stadia réel, `https://tiles.stadiamaps.com/styles/alidade_smooth_dark.json` : `glyphs` sert
 * `["Stadia Bold", "Stadia Semibold", "Stadia Italic", "Stadia Regular"]`. « Stadia Semibold » est
 * la police semi-grasse demandée par le design. **Codé en dur SEUL n'est pas sûr** : `MAP_TILES_STYLE_URL`
 * est configurable par environnement — le style de démonstration MapLibre utilisé en dev/E2E
 * (`https://demotiles.maplibre.org/style.json`) sert un jeu de glyphes DIFFÉRENT (`Open Sans
 * Semibold`, relevé le même jour). Utiliser « Stadia Semibold » tel quel ferait donc disparaître
 * les étiquettes en dev/E2E sans qu'aucun test ne s'en aperçoive.
 *
 * La résolution se fait donc À L'EXÉCUTION, contre les fonts RÉELLEMENT utilisées par les couches
 * `symbol` déjà présentes dans le style CHARGÉ (`map.getStyle()`) : ces couches s'affichent déjà,
 * ce qui garantit que leur font-stack est bien servi par l'endpoint `glyphs` de CE style, quel
 * qu'il soit. C'est la « liste de repli à deux entrées » demandée par §9.3 : la police
 * semi-grasse préférée si le style en sert une, puis la première police disponible sinon.
 */

const PREFERRED_FONT_NAME_PATTERN = /semibold/i;

/** Filet ultime, documentaire — n'est atteint QUE si le style chargé n'a AUCUNE couche `symbol`
 * (aucun basemap réel connu n'est dans ce cas : Stadia et le style de démonstration en portent tous
 * deux au moins une). Sans lui, `resolveRouteLabelFontStack` devrait renvoyer un tableau vide, ce
 * qui romprait le type `string[]` attendu par `buildRouteLabelsLayer()`. */
const ULTIMATE_FALLBACK_FONT_STACK: readonly string[] = ["Noto Sans Regular"];

export interface StyleLayerLike {
  type: string;
  // Volontairement large (`Record<string, unknown>`, pas `{ "text-font"?: string[] }`) : le style
  // RÉEL de MapLibre (`StyleSpecification`) type chaque variante de couche avec un `layout`
  // DIFFÉRENT (une couche `fill` n'a structurellement AUCUNE propriété en commun avec une couche
  // `symbol`), ce qui rendrait `LayerSpecification[]` non assignable à un `layout` étroit ici — la
  // détection TypeScript des types "sans propriété en commun" (erreur TS2345) l'interdirait tel
  // quel. Le rétrécissement vers `string[] | undefined` se fait donc AU POINT DE LECTURE.
  layout?: Record<string, unknown>;
}

export interface StyleLike {
  layers: StyleLayerLike[];
}

/** Fonts distinctes utilisées par les couches `symbol` déjà présentes dans le style — garanties
 * servies par son endpoint `glyphs`, puisqu'elles s'affichent déjà. */
function collectAvailableFontStacks(style: StyleLike): string[][] {
  const seen = new Set<string>();
  const stacks: string[][] = [];
  for (const layer of style.layers) {
    if (layer.type !== "symbol") continue;
    const font = layer.layout?.["text-font"] as string[] | undefined;
    if (!font || font.length === 0) continue;
    const key = font.join(",");
    if (seen.has(key)) continue;
    seen.add(key);
    stacks.push(font);
  }
  return stacks;
}

/**
 * Deux entrées de repli, dans l'ordre : la première font-stack du style dont un nom correspond à
 * `/semibold/i` (préférence design, §5.7.4), sinon la première font-stack disponible du style.
 * `ULTIMATE_FALLBACK_FONT_STACK` documentaire si le style ne sert vraiment aucune police.
 */
export function resolveRouteLabelFontStack(style: StyleLike): readonly string[] {
  const available = collectAvailableFontStacks(style);
  if (available.length === 0) return ULTIMATE_FALLBACK_FONT_STACK;

  const preferred = available.find((stack) => stack.some((font) => PREFERRED_FONT_NAME_PATTERN.test(font)));
  return preferred ?? available[0];
}
