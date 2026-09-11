"use client";

import { useCallback, useState } from "react";

import type { MapSport } from "@hybride/domain";

import { defaultActiveFilters, loadActiveFilters, saveActiveFilters, toggleActiveFilter } from "./filters-storage";

/**
 * État React des pastilles de filtre — ADR-018, lot L3 ; `docs/design-carte.md` §4.3.
 *
 * `useState(() => …)` lit `localStorage` UNE SEULE FOIS, à l'initialisation (pas dans un
 * `useEffect` : éviter un premier rendu à l'état par défaut suivi d'un flash vers l'état persisté).
 * `localStorage` n'existe pas côté serveur, mais ce hook n'est appelé que depuis `<MapCanvas>`
 * (`"use client"`, chargé via `next/dynamic`, `ssr: false`) : `window` y est toujours défini.
 */
export function useActiveFilters() {
  const [activeFilters, setActiveFilters] = useState<Set<MapSport>>(() => {
    if (typeof window === "undefined") return defaultActiveFilters();
    return loadActiveFilters(window.localStorage);
  });

  const toggleFilter = useCallback((sport: MapSport) => {
    setActiveFilters((current) => {
      const next = toggleActiveFilter(current, sport);
      if (typeof window !== "undefined") saveActiveFilters(window.localStorage, next);
      return next;
    });
  }, []);

  const showAllFilters = useCallback(() => {
    setActiveFilters(() => {
      const next = defaultActiveFilters();
      if (typeof window !== "undefined") saveActiveFilters(window.localStorage, next);
      return next;
    });
  }, []);

  return { activeFilters, toggleFilter, showAllFilters };
}
