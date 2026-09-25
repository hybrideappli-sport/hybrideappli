import { describe, expect, it } from "vitest";

import type { MapSport } from "@hybride/domain";

import { defaultActiveFilters, loadActiveFilters, MAP_FILTERS_STORAGE_KEY, saveActiveFilters, toggleActiveFilter } from "./filters-storage";

class FakeStorage implements Pick<Storage, "getItem" | "setItem"> {
  private store = new Map<string, string>();
  getItem(key: string) {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.store.set(key, value);
  }
}

describe("defaultActiveFilters (design-carte.md §4.3)", () => {
  it("état initial : les quatre sports actifs", () => {
    expect(defaultActiveFilters()).toEqual(new Set(["route", "trail", "hike", "bike"]));
  });
});

describe("loadActiveFilters — lecture défensive", () => {
  it("rien de stocké ⟹ état initial (les quatre)", () => {
    expect(loadActiveFilters(new FakeStorage())).toEqual(defaultActiveFilters());
  });

  it("relit exactement ce qui a été sauvegardé", () => {
    const storage = new FakeStorage();
    saveActiveFilters(storage, new Set<MapSport>(["hike", "bike"]));
    expect(loadActiveFilters(storage)).toEqual(new Set(["hike", "bike"]));
  });

  it("zéro filtre actif est un état persisté et relu tel quel (§4.3 : autorisé)", () => {
    const storage = new FakeStorage();
    saveActiveFilters(storage, new Set());
    expect(loadActiveFilters(storage)).toEqual(new Set());
  });

  it("JSON corrompu ⟹ repli sur l'état initial, jamais une exception", () => {
    const storage = new FakeStorage();
    storage.setItem(MAP_FILTERS_STORAGE_KEY, "{ceci n'est pas du JSON");
    expect(loadActiveFilters(storage)).toEqual(defaultActiveFilters());
  });

  it("valeurs invalides dans le tableau sont ignorées, les valides conservées", () => {
    const storage = new FakeStorage();
    storage.setItem(MAP_FILTERS_STORAGE_KEY, JSON.stringify(["hike", "ski", 42, null]));
    expect(loadActiveFilters(storage)).toEqual(new Set(["hike"]));
  });

  it("contenu qui n'est pas un tableau ⟹ repli sur l'état initial", () => {
    const storage = new FakeStorage();
    storage.setItem(MAP_FILTERS_STORAGE_KEY, JSON.stringify({ hike: true }));
    expect(loadActiveFilters(storage)).toEqual(defaultActiveFilters());
  });
});

describe("toggleActiveFilter", () => {
  it("bascule un sport actif vers inactif, et réciproquement", () => {
    const active = new Set<MapSport>(["hike", "bike"]);
    expect(toggleActiveFilter(active, "hike")).toEqual(new Set(["bike"]));
    expect(toggleActiveFilter(active, "route")).toEqual(new Set(["hike", "bike", "route"]));
  });

  it("peut désactiver la dernière pastille (§4.3 : zéro filtre actif autorisé)", () => {
    expect(toggleActiveFilter(new Set<MapSport>(["hike"]), "hike")).toEqual(new Set());
  });

  it("ne mute pas l'ensemble d'entrée", () => {
    const active = new Set<MapSport>(["hike"]);
    toggleActiveFilter(active, "bike");
    expect(active).toEqual(new Set(["hike"]));
  });
});
