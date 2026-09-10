"use client";

import { useCallback, useRef, useState } from "react";

import type { MapTrailFeature, MapTrailsResponse } from "@hybride/domain";

/**
 * Client HTTP de `GET /api/v1/map/trails` — ADR-018, lot L3 ; `docs/design-carte.md` §7.1
 * (chargement), §7.4 (dégradé), §7.5 (erreur totale), §7.6 (troncature).
 *
 * Appelé à la stabilisation du viewport (`moveend`/`zoomend` DÉBOUNCÉS — voir `<MapCanvas>`,
 * ADR-018 question ouverte n°2, déjà en place en L1). N'appelle PAS Overpass directement (ADR-018
 * §3) : uniquement notre propre route, déjà protégée par le rate-limiter d'entrée (L2).
 */
export type TrailsFetchStatus = "idle" | "loading" | "ok" | "zoom_required" | "error";

export interface TrailsFetchState {
  status: TrailsFetchStatus;
  /** Les tracés du dernier chargement RÉUSSI — conservés pendant un rafraîchissement en cours
   * (§7.1 : « un panoramique ne doit jamais vider l'écran »), effacés seulement par une erreur. */
  trails: MapTrailFeature[];
  degraded: boolean;
  truncated: boolean;
}

const INITIAL_STATE: TrailsFetchState = { status: "idle", trails: [], degraded: false, truncated: false };

export function useTrailsFetch() {
  const [state, setState] = useState<TrailsFetchState>(INITIAL_STATE);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchBbox = useCallback((bbox: string) => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setState((current) => ({ ...current, status: "loading" }));

    fetch(`/api/v1/map/trails?bbox=${encodeURIComponent(bbox)}`, { signal: controller.signal })
      .then(async (response) => {
        if (response.status === 502) {
          setState((current) => ({ ...current, status: "error" }));
          return;
        }
        if (!response.ok) {
          setState((current) => ({ ...current, status: "error" }));
          return;
        }
        const body = (await response.json()) as MapTrailsResponse;
        if (body.status === "zoom_required") {
          setState({ status: "zoom_required", trails: [], degraded: false, truncated: false });
          return;
        }
        setState({ status: "ok", trails: body.trails, degraded: body.degraded, truncated: body.truncated });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return; // requête remplacée, pas une erreur
        setState((current) => ({ ...current, status: "error" }));
      });
  }, []);

  return { state, fetchBbox };
}
