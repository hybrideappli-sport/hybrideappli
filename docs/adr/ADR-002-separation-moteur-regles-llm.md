# ADR-002 — Séparation stricte moteur à règles / LLM

- **Statut** : Accepté
- **Date** : 2026-08-04
- **Décideur** : `architect`
- **Portée** : Projet — décision structurante n°1 du produit
- **Feature déclenchante** : US-01 — Coach IA personnalisé

---

## Contexte

La fiche `07-spec-feature1-coach-ia.md` (§5, Intégrations tierces) pose une contrainte non négociable :

> Le LLM **n'a jamais autorité** sur le contenu chiffré du plan (volume, charge, intensité) — cette responsabilité reste exclusivement au moteur à règles, pour auditabilité et sécurité anti-blessure.

Et (§5, Contrainte d'auditabilité) :

> Toute décision de volume/charge/intensité doit pouvoir être tracée à une règle et à une donnée d'entrée précise.

S'y ajoutent des garde-fous de sécurité durs et non contournables (AC8), un protocole douleur à 3 niveaux avec orientation médicale (AC9), et une revue qualité asynchrone du fondateur sur les plans générés (§4). Un LLM est non déterministe, non rejouable, et ne peut pas porter de garantie de borne dure. Il reste en revanche le bon outil pour la conversation d'onboarding (AC1, AC3), la reformulation en cas d'incompréhension (`04-flow.md`) et la mise en langage naturel des explications (AC1, AC5).

## Décision

Trois responsabilités séparées par des frontières de module explicites et non franchissables.

```
                          ┌──────────────────────────────┐
   entrées déclaratives   │  API applicative (Next.js)   │
   & saisies utilisateur  │  Route Handlers /api/v1      │
        ──────────────────▶  auth, RLS, validation Zod,  │
                          │  paywall, orchestration      │
                          └───────┬──────────────┬───────┘
                                  │              │
                   PlanningContext│              │DecisionTrace[]
                   (snapshot pur) │              │(déjà décidé)
                                  ▼              ▼
                    ┌──────────────────┐   ┌──────────────────────┐
                    │  RULES ENGINE    │   │   COACH LLM          │
                    │  @hybride/rules  │   │   @hybride/coach-llm │
                    │                  │   │                      │
                    │  pur, 0 I/O      │   │  conversation        │
                    │  déterministe    │   │  extraction profil   │
                    │  rejouable       │   │  rédaction textes    │
                    │  versionné       │   │                      │
                    │                  │   │  JAMAIS de chiffre   │
                    │  → PlanDraft     │   │  de plan produit ici │
                    │  → DecisionTrace │   │  → short/long text   │
                    └──────────────────┘   └──────────────────────┘
```

### 1. `@hybride/rules-engine` — autorité unique sur les chiffres

- **Fonction pure** : `generatePlan(context: PlanningContext, ruleset: Ruleset): EngineResult`.
- **Zéro I/O** : aucun accès réseau, base, horloge système, `Math.random`, `process.env`. La date courante et toute source d'aléa sont **injectées** dans le `PlanningContext`.
- **Déterministe et rejouable** : `hash(PlanningContext) + ruleset_version` ⟹ sortie identique. C'est la condition technique de la revue qualité du fondateur et du débogage d'un plan produit il y a trois mois.
- **Sortie** : `{ plan: PlanDraft, traces: DecisionTrace[], guardrailsApplied: GuardrailHit[] }`. **Toute** valeur chiffrée du `PlanDraft` (durée, charge, intensité, kcal, macros) est couverte par au moins une `DecisionTrace` — c'est vérifié par une assertion en fin de run, pas seulement par convention.
- La contrainte de pureté est **outillée**, pas déclarative : package séparé sans dépendance runtime autre que `@hybride/domain`, règle ESLint `import/no-restricted-paths`, et absence des SDK réseau du `package.json` du package.

### 2. `@hybride/coach-llm` — conversation et mise en mots

Trois usages, et trois seulement :

| Usage | Entrée | Sortie | Garde-fou |
|---|---|---|---|
| Onboarding conversationnel | historique de messages + schéma de profil cible | prochaine question + **patch de `ProfileDraft` structuré** (tool call / JSON schema) | La sortie est validée par Zod côté serveur ; le profil n'est jamais persisté sans **confirmation explicite de l'utilisateur** (AC1 : "il valide son profil initial"). |
| Reformulation sur réponse incomprise | dernier tour + raison de l'échec de parsing | question reformulée | Compteur de tours, repli sur une question fermée après N échecs. |
| Rédaction des explications | `DecisionTrace[]` **déjà calculées** | `short_text` + `long_text` | Contrôle d'intégrité numérique (voir ci-dessous) + repli template. |

### 3. Contrôle d'intégrité numérique (garde-fou anti-hallucination)

Avant persistance d'une explication générée par LLM :

1. extraction de tous les littéraux numériques du texte produit ;
2. confrontation à l'ensemble des valeurs présentes dans les `DecisionTrace` sources (valeurs d'entrée + valeurs de sortie), à tolérance nulle ;
3. si un nombre est introduit, absent ou altéré → l'explication LLM est **rejetée**, `numeric_integrity_ok = false`, et le système **retombe sur le rendu par template déterministe**.

Le produit n'est donc jamais bloqué par le LLM, et ne peut jamais afficher un chiffre que le moteur n'a pas calculé.

### 4. Sens unique de la dépendance

`api → rules-engine`, `api → coach-llm`, `coach-llm → domain`. **`coach-llm` ne dépend jamais de `rules-engine` et ne peut pas l'invoquer.** Le LLM ne peut donc pas, même indirectement, déclencher un recalcul ou modifier un plan.

## Conséquences

**Positives**

- Les garde-fous AC8 (plafonds, décharge obligatoire, jours consécutifs sans repos) et le protocole douleur AC9 sont testables de façon exhaustive et **prouvables par property-based testing** ("aucun plan généré, quelle que soit l'entrée, ne dépasse le plafond de progression").
- La panne, la latence ou la dérive du fournisseur LLM dégradent l'UX (explications en style template) mais **n'affectent jamais la sécurité ni le contenu du plan**.
- Réponse directe au frein persona "est-ce que l'algo comprend vraiment ce que je fais ?" : chaque recommandation est traçable à une règle et une donnée (AC1).
- Le moteur peut être exécuté hors ligne sur un lot de profils pour valider une nouvelle version de règles avant publication.

**Négatives / à surveiller**

- Le rendu par template doit être écrit et maintenu **en plus** du rendu LLM (coût de duplication assumé : c'est le prix du repli).
- Le moteur à règles porte l'essentiel de la valeur produit et devient le fichier le plus critique du repo : discipline de revue et de tests obligatoire.
- Le `PlanningContext` doit être un snapshot complet et auto-suffisant, ce qui impose de la rigueur dans sa construction (voir ADR-005).

## Alternatives écartées

| Alternative | Raison du rejet |
|---|---|
| LLM génère le plan, règles en post-validation | Un plan rejeté par les garde-fous doit être régénéré, sans garantie de convergence ; non déterministe donc non rejouable ; impossible de tracer un volume à une règle. Contredit frontalement §5 de la fiche. |
| LLM avec function calling vers des outils de calcul | Le LLM garde l'autorité sur l'orchestration, donc sur le résultat final. La borne dure n'est plus garantie. |
| Tout par templates, sans LLM | L'onboarding conversationnel (AC1, AC3) et la reformulation (`04-flow.md`) sont des exigences produit explicites. |
| Un seul package mêlant règles et LLM | La pureté du moteur ne serait plus outillée, seulement conventionnelle — elle se dégraderait à la première urgence. |
