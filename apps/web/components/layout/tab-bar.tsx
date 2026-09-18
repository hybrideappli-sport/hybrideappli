"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, CalendarRange, House, User, type LucideIcon } from "lucide-react";

/**
 * `P-tabbar` — tab bar réelle, `08-architecture.md` §12 question 20 : le design F3 (`jSZB0`,
 * `10-design-feature3-notes.md` §1.1) suppose une tab bar à 4 items qui n'existait pas en code
 * (`app/(app)/layout.tsx` ne rendait qu'un conteneur, la navigation passait par des liens épars).
 * Sans elle, `/planning` était livrable mais inatteignable.
 *
 * 4 items, `docs/design-system.md` §4.9 — « Compte » jamais « Profil » (décision déjà tranchée,
 * `08-architecture.md` §12 question 15).
 *
 * LIBELLÉS (révisés le 2026-09-18). Les deux premiers étaient « Aujourd'hui » → `/dashboard` et
 * « Séance » → `/aujourdhui` : deux mots quasi synonymes, dont le premier pointait vers une route
 * qui ne porte pas son nom. Un utilisateur cherchant sa séance du jour avait deux onglets
 * plausibles et le mauvais venait en tête. « Accueil » nomme ce que l'écran est vraiment (un
 * aperçu), « Ma séance » ce qu'on y fait.
 *
 * ICÔNES. Aucune n'avait jamais été choisie : ni en code (la barre ne rendait que du texte), ni
 * dans la maquette Pencil, où les quatre « icônes » sont des rectangles 18 × 18 placeholders.
 * Jeu retenu par le fondateur : volontairement neutre. `Activity` plutôt qu'un haltère, qui
 * dirait « musculation » sur une app qui enchaîne course, vélo, natation et muscu ;
 * `CalendarRange` plutôt qu'un calendrier mensuel, parce que le planning est une fenêtre
 * GLISSANTE J → J+7 et jamais une grille Lun→Dim (`10-design-feature3-notes.md` §2).
 */
const TAB_ITEMS: readonly { href: string; label: string; Icon: LucideIcon }[] = [
  { href: "/dashboard", label: "Accueil", Icon: House },
  { href: "/aujourdhui", label: "Ma séance", Icon: Activity },
  { href: "/planning", label: "Planning", Icon: CalendarRange },
  { href: "/compte", label: "Compte", Icon: User },
];

/** Écrans racines uniquement — les sous-écrans (`/donnees`, `/score`, `/revision`, …) n'affichent pas la tab bar (motif `Yf6zY`, `✕` de fermeture). */
const ROOT_PATHS: readonly string[] = TAB_ITEMS.map((item) => item.href);

export function TabBar() {
  const pathname = usePathname();
  if (!ROOT_PATHS.includes(pathname)) return null;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-stretch justify-around border-t border-border-subtle bg-surface-sunken pb-[env(safe-area-inset-bottom)]"
      aria-label="Navigation principale"
      data-testid="tab-bar"
    >
      {TAB_ITEMS.map(({ href, label, Icon }) => {
        const isActive = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={`flex flex-1 flex-col items-center justify-center gap-1 text-small ${isActive ? "text-accent-text" : "text-foreground-subtle"}`}
            data-testid={`tab-bar-item-${href.slice(1)}`}
          >
            {/* `aria-hidden` : le libellé porte déjà l'information, l'icône ne doit pas la
                doubler pour un lecteur d'écran. 24 px imposés par la charte §4.9. */}
            <Icon size={24} strokeWidth={2} aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
