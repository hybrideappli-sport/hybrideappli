# ADR-003 — Monorepo pnpm + isolation physique du moteur à règles

- **Statut** : Accepté
- **Date** : 2026-08-04
- **Décideur** : `architect`
- **Portée** : Projet
- **Dépend de** : ADR-001, ADR-002

---

## Contexte

L'ADR-002 impose que le moteur à règles soit pur (aucune I/O) et que le service LLM ne puisse pas l'invoquer. Une simple convention de dossiers (`/lib/rules-engine/`) dans une application Next.js unique ne garantit rien : rien n'empêche techniquement un développeur pressé d'importer le client Supabase dans une règle, et la contrainte se dégrade à la première correction urgente.

Par ailleurs, l'ADR-001 prévoit l'ajout ultérieur d'un client Expo consommant la même API et les mêmes types.

## Décision

Monorepo **pnpm workspaces + Turborepo**.

```
hybride-club/
├─ apps/
│  └─ web/                      # Next.js 16 (App Router) + PWA — ADR-001
│                               # (futur : apps/mobile — Expo, non V1)
├─ packages/
│  ├─ domain/                   # types + schémas Zod + contrats API (aucune dépendance)
│  ├─ rules-engine/             # moteur à règles PUR — dépend uniquement de domain
│  ├─ coach-llm/                # conversation & rédaction — dépend de domain + SDK LLM
│  └─ db/                       # client Supabase typé, repositories, types générés
├─ supabase/
│  ├─ migrations/
│  └─ seed.sql
├─ docs/
│  ├─ adr/
│  └─ rulesets/                 # documentation des règles et de leurs sources
└─ turbo.json / pnpm-workspace.yaml
```

**Graphe de dépendances autorisé (vérifié en CI) :**

```
apps/web  →  domain, rules-engine, coach-llm, db
db        →  domain
rules-engine → domain            (et RIEN d'autre)
coach-llm    → domain            (+ SDK LLM)
domain       → ∅
```

Contrôles automatiques :

- `packages/rules-engine/package.json` ne déclare **aucune** dépendance réseau/base — un ajout est visible en revue de PR ;
- règle ESLint `import/no-restricted-paths` interdisant `rules-engine → db|coach-llm|next|@supabase/*` ;
- test de garde en CI (`rules-engine/purity.test.ts`) : exécution du moteur avec `fetch`, `Date.now` et `Math.random` monkey-patchés en `throw` — toute impureté fait échouer la CI.

## Conséquences

**Positives**

- La contrainte d'auditabilité de l'ADR-002 devient une propriété **vérifiée par la CI**, pas une intention.
- `@hybride/domain` est le point de vérité unique des contrats : un changement de contrat casse la compilation du front et du back en même temps.
- Le moteur est testable et exécutable en isolation (rejeu de plans historiques, simulations en batch) sans démarrer Next.js ni Supabase.
- Prépare l'ajout d'`apps/mobile` sans refonte.

**Négatives / à surveiller**

- Surcoût de configuration initiale (workspace, Turborepo, `transpilePackages` côté Next.js, Root Directory `apps/web` sur Vercel).
- Le `developer` doit connaître pnpm workspaces ; les commandes usuelles changent (`pnpm --filter @hybride/web dev`).
- Générations de types Supabase à câbler dans `packages/db` et non à la racine de l'app.

## Alternatives écartées

| Alternative | Raison du rejet |
|---|---|
| Application Next.js unique avec `/lib/rules-engine` | Isolation purement conventionnelle ; ne survit pas à la pression du delivery. Contredit l'esprit de l'ADR-002. |
| Back-end séparé (NestJS/Fastify) déployé à part | Double déploiement, double authentification, latence supplémentaire, et aucun gain : l'isolation recherchée est une isolation **de module**, pas de processus. À reconsidérer seulement si le moteur devient coûteux en CPU (jobs longs). |
| Publication du moteur en package npm privé | Boucle de feedback trop lente en phase de lancement (publish à chaque itération de règle). |
