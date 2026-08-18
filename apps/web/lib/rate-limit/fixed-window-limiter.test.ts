import { describe, expect, it } from "vitest";

import { FixedWindowRateLimiter } from "./fixed-window-limiter";

describe("FixedWindowRateLimiter (I3)", () => {
  it("autorise jusqu'à `max` requêtes dans la même fenêtre, puis refuse", () => {
    const limiter = new FixedWindowRateLimiter({ windowMs: 1000, max: 3 });
    const now = 10_000;

    expect(limiter.consume("k", now)).toEqual({ allowed: true, remaining: 2, retryAfterMs: 0 });
    expect(limiter.consume("k", now + 10)).toEqual({ allowed: true, remaining: 1, retryAfterMs: 0 });
    expect(limiter.consume("k", now + 20)).toEqual({ allowed: true, remaining: 0, retryAfterMs: 0 });

    const rejected = limiter.consume("k", now + 30);
    expect(rejected.allowed).toBe(false);
    expect(rejected.remaining).toBe(0);
    expect(rejected.retryAfterMs).toBeGreaterThan(0);
  });

  it("réinitialise la fenêtre une fois `windowMs` écoulé", () => {
    const limiter = new FixedWindowRateLimiter({ windowMs: 1000, max: 1 });
    const now = 10_000;

    expect(limiter.consume("k", now).allowed).toBe(true);
    expect(limiter.consume("k", now + 500).allowed).toBe(false);
    expect(limiter.consume("k", now + 1000).allowed).toBe(true); // nouvelle fenêtre, >= windowMs écoulé
  });

  it("des clés différentes ont des compteurs indépendants", () => {
    const limiter = new FixedWindowRateLimiter({ windowMs: 1000, max: 1 });
    const now = 10_000;

    expect(limiter.consume("a", now).allowed).toBe(true);
    expect(limiter.consume("b", now).allowed).toBe(true);
    expect(limiter.consume("a", now).allowed).toBe(false);
  });

  it("`reset()` efface tout l'état", () => {
    const limiter = new FixedWindowRateLimiter({ windowMs: 1000, max: 1 });
    const now = 10_000;

    expect(limiter.consume("k", now).allowed).toBe(true);
    expect(limiter.consume("k", now).allowed).toBe(false);
    limiter.reset();
    expect(limiter.consume("k", now).allowed).toBe(true);
  });
});
