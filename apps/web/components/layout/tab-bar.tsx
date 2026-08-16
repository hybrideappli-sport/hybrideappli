"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * `P-tabbar` — tab bar réelle, `08-architecture.md` §12 question 20 : le design F3 (`jSZB0`,
 * `10-design-feature3-notes.md` §1.1) suppose une tab bar à 4 items qui n'existait pas en code
 * (`app/(app)/layout.tsx` ne rendait qu'un conteneur, la navigation passait par des liens épars).
 * Sans elle, `/planning` était livrable mais inatteignable.
 *
 * 4 items, `docs/design-system.md` §4.9 : « Aujourd'hui » (aperçu Dashboard) · « Séance » (détail
 * du jour, `/aujourdhui`) · « Planning » (semaine, F3) · « Compte » — jamais « Profil » (décision
 * déjà tranchée, `08-architecture.md` §12 question 15).
 */
const TAB_ITEMS = [
  { href: "/dashboard", label: "Aujourd'hui" },
  { href: "/aujourdhui", label: "Séance" },
  { href: "/planning", label: "Planning" },
  { href: "/compte", label: "Compte" },
] as const;

/** Écrans racines uniquement — les sous-écrans (`/donnees`, `/score`, `/revision`, …) n'affichent pas la tab bar (motif `Yf6zY`, `✕` de fermeture). */
const ROOT_PATHS: readonly string[] = TAB_ITEMS.map((item) => item.href);

export function TabBar() {
  const pathname = usePathname();
  if (!ROOT_PATHS.includes(pathname)) return null;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-stretch justify-around border-t border-border bg-surface-sunken pb-[env(safe-area-inset-bottom)]"
      aria-label="Navigation principale"
      data-testid="tab-bar"
    >
      {TAB_ITEMS.map((item) => {
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={`flex flex-1 flex-col items-center justify-center gap-1 text-small ${isActive ? "text-accent-text" : "text-foreground-subtle"}`}
            data-testid={`tab-bar-item-${item.href.slice(1)}`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
