import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { debounce } from "./debounce";

describe("debounce (ADR-018, question ouverte n°2 — levier de premier rang)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("n'appelle PAS la fonction pendant la rafale (le geste en cours)", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 400);

    debounced();
    vi.advanceTimersByTime(100);
    debounced();
    vi.advanceTimersByTime(100);
    debounced();

    expect(fn).not.toHaveBeenCalled();
  });

  it("appelle la fonction UNE SEULE FOIS, à la stabilisation, avec les derniers arguments", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 400);

    debounced("premier");
    vi.advanceTimersByTime(100);
    debounced("dernier");
    vi.advanceTimersByTime(400);

    expect(fn).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledWith("dernier");
  });

  it("autorise un nouvel appel après stabilisation complète", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 400);

    debounced();
    vi.advanceTimersByTime(400);
    debounced();
    vi.advanceTimersByTime(400);

    expect(fn).toHaveBeenCalledTimes(2);
  });
});
