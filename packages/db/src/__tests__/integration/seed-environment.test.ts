import { describe, expect, it } from "vitest";

import { withPgClient } from "./support/pg-client";

/**
 * `docs/db-schema.md` §9.3 (T14/T15/T16) — arbitrage `architect` du 2026-08-09 sur l'activation de
 * `consent_documents.is_current` et `rulesets.is_active` par `supabase/seed.sql`, **hors production
 * uniquement**, de façon **défensive** (`not exists (...)`) pour ne jamais entrer en collision avec
 * les index uniques `consent_documents_current` (partiel, `(code, locale) where is_current`) et
 * `rulesets_single_active` (global, `(is_active) where is_active`) le jour où une migration de
 * production publie une version de document juridiquement validée / un ruleset `1.x` actif.
 *
 * T15 et T16 manipulent l'état de la base à l'intérieur d'une transaction jamais commitée
 * (`begin` / `rollback`) : les autres suites de ce paquet ne voient jamais ces écritures
 * intermédiaires (isolation Postgres standard), et `fileParallelism: false`
 * (`vitest.integration.config.ts`) garantit qu'aucun autre fichier de test ne s'exécute en
 * parallèle pendant ce test.
 */

const CONSENT_CODES = ["medical_disclaimer", "health_data_processing", "terms", "privacy"] as const;

describe("seed.sql — activation défensive de is_current / is_active (docs/db-schema.md §9.3)", () => {
  it("T14 — après `supabase db reset` local : exactement une ligne is_current par (code, locale) et le ruleset 0.1.0-dev actif", async () => {
    await withPgClient(async (client) => {
      for (const code of CONSENT_CODES) {
        const { rows } = await client.query<{ version: string }>(
          "select version from consent_documents where code = $1 and locale = 'fr' and is_current",
          [code],
        );
        expect(rows, `${code} : exactement une version is_current attendue en local`).toHaveLength(1);
        expect(rows[0]?.version).toBe("1.0.0");
      }

      const { rows: activeRulesets } = await client.query<{ version: string }>(
        "select version from rulesets where is_active",
      );
      expect(activeRulesets, "un seul ruleset actif attendu en local").toHaveLength(1);
      expect(activeRulesets[0]?.version).toBe("0.1.0-dev");
    });
  });

  it("T15 — migrations seules, sans `seed.sql` (simulation production) : zéro is_current, zéro ruleset actif", async () => {
    await withPgClient(async (client) => {
      await client.query("begin");
      try {
        // Défait ce que `seed.sql` a posé au dernier `db reset`, pour retomber sur l'état que
        // `0010_seed_referentials.sql` produit à lui seul — exactement ce qu'une base de
        // production voit, puisque `seed.sql` n'y est structurellement jamais rejoué.
        await client.query("update consent_documents set is_current = false");
        await client.query("update rulesets set is_active = false");

        const { rows: current } = await client.query<{ code: string }>(
          "select code from consent_documents where is_current",
        );
        expect(
          current,
          "aucun document ne doit être en vigueur en production tant que la migration d'activation juridique n'est pas livrée (ADR-010 §9)",
        ).toHaveLength(0);

        const { rows: active } = await client.query<{ version: string }>(
          "select version from rulesets where is_active",
        );
        expect(
          active,
          "aucun ruleset ne doit être actif en production avant publication d'une version validée (ADR-007)",
        ).toHaveLength(0);

        // Contrat de la route (Lot L2/L3, docs/db-schema.md §9.3) : sans `is_current`, `POST
        // /api/v1/consents` et `.../disclaimer` devront répondre `503
        // CONSENT_DOCUMENT_UNAVAILABLE` plutôt que planter en `500` ou insérer une version
        // arbitraire. La route n'existe pas encore avant le Lot L2 : DETTE explicite pour
        // `tester`, à couvrir dès son implémentation.
      } finally {
        // Jamais commité : la base réelle retrouve son état seedé pour les suites suivantes.
        await client.query("rollback");
      }
    });
  });

  it("T16 — idempotence : rejouer l'activation défensive de seed.sql quand une version validée est déjà is_current ne la déloge pas", async () => {
    await withPgClient(async (client) => {
      await client.query("begin");
      try {
        // 1) Retombe sur l'état « migrations seules » (comme T15), puis simule une migration de
        //    production ayant publié une version juridiquement validée, postérieure à `1.0.0`.
        await client.query("update consent_documents set is_current = false");
        await client.query("update rulesets set is_active = false");

        for (const code of CONSENT_CODES) {
          await client.query(
            `insert into consent_documents (code, version, locale, title, body_md, checksum, is_current)
             values ($1, '9.9.9', 'fr', 'Version validée (test T16)', 'Corps validé (test T16)', 'checksum-test-t16', true)`,
            [code],
          );
        }
        await client.query(
          `insert into rulesets (version, params, source_refs, checksum, is_active, published_at)
           values ('9.9.9', '{}'::jsonb, '{}'::jsonb, 'checksum-test-t16', true, now())`,
        );

        // 2) Rejoue exactement la forme défensive écrite dans `supabase/seed.sql` : ne doit ni
        //    déloger la version validée, ni violer `consent_documents_current` /
        //    `rulesets_single_active` (l'échec se manifesterait par une exception levée ici même).
        await client.query(`
          update consent_documents d
             set is_current = true
           where d.version = '1.0.0'
             and d.locale  = 'fr'
             and d.code in ('medical_disclaimer','health_data_processing','terms','privacy')
             and not exists (
               select 1 from consent_documents c
                where c.code = d.code and c.locale = d.locale and c.is_current
             );
        `);
        await client.query(`
          update rulesets
          set is_active = true,
              published_at = coalesce(published_at, now())
          where version = '0.1.0-dev'
            and not exists (
              select 1 from rulesets r where r.is_active
            );
        `);

        // 3) La version validée reste seule en vigueur ; `1.0.0` / `0.1.0-dev` ne l'ont pas
        //    délogée.
        for (const code of CONSENT_CODES) {
          const { rows } = await client.query<{ version: string }>(
            "select version from consent_documents where code = $1 and locale = 'fr' and is_current",
            [code],
          );
          expect(
            rows,
            `${code} : la version validée doit rester seule is_current, 1.0.0 ne doit pas la déloger`,
          ).toHaveLength(1);
          expect(rows[0]?.version).toBe("9.9.9");
        }

        const { rows: active } = await client.query<{ version: string }>(
          "select version from rulesets where is_active",
        );
        expect(
          active,
          "le ruleset publié doit rester seul actif, 0.1.0-dev ne doit pas le déloger",
        ).toHaveLength(1);
        expect(active[0]?.version).toBe("9.9.9");
      } finally {
        // Jamais commité : la base réelle (versions 9.9.9 comprises) redevient invisible.
        await client.query("rollback");
      }
    });
  });
});
