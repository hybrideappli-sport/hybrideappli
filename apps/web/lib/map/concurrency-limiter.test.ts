import { describe, expect, it } from "vitest";
import { createConcurrencyLimiter } from "./concurrency-limiter";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("createConcurrencyLimiter — ADR-018 §4.3 (N4, concurrence sortante bornée à 2)", () => {
  it("n'exécute jamais plus de `maxConcurrent` tâches simultanément", async () => {
    const limiter = createConcurrencyLimiter(2);
    let active = 0;
    let maxObservedActive = 0;
    const gates = Array.from({ length: 5 }, () => deferred<void>());

    const runs = gates.map((gate, index) =>
      limiter.run(async () => {
        active += 1;
        maxObservedActive = Math.max(maxObservedActive, active);
        await gate.promise;
        active -= 1;
        return index;
      }),
    );

    // Laisse les micro-tâches s'installer avant de libérer les portes une à une.
    await Promise.resolve();
    await Promise.resolve();
    expect(active).toBe(2);

    gates[0].resolve();
    await Promise.resolve();
    await Promise.resolve();
    gates[1].resolve();
    await Promise.resolve();
    await Promise.resolve();
    gates[2].resolve();
    gates[3].resolve();
    gates[4].resolve();

    const results = await Promise.all(runs);
    expect(results).toEqual([0, 1, 2, 3, 4]);
    expect(maxObservedActive).toBeLessThanOrEqual(2);
  });

  it("laisse passer une tâche immédiatement quand la limite n'est pas atteinte", async () => {
    const limiter = createConcurrencyLimiter(2);
    const result = await limiter.run(async () => "ok");
    expect(result).toBe("ok");
  });

  it("propage une erreur de tâche sans bloquer le slot pour les suivantes", async () => {
    const limiter = createConcurrencyLimiter(1);
    await expect(
      limiter.run(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    const result = await limiter.run(async () => "après échec");
    expect(result).toBe("après échec");
  });
});
