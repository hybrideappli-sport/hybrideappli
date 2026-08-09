# ADR-010 — Données de santé : consentement versionné, minimisation LLM, hébergement UE

- **Statut** : Accepté
- **Date** : 2026-08-04 — **révisé le 2026-08-07** (§2, §7 réécrit, §8 ajouté)
- **Décideur** : `architect`
- **Portée** : Projet — conformité
- **Feature déclenchante** : US-01, AC3 / AC9 / AC11 et contrainte légale §5
- **Complété par** : ADR-012 (modèle de privilèges — écriture des consentements, granularité des policies)

---

## Contexte

La fiche impose (§5, contrainte légale/éthique) :

- disclaimer « n'est pas un dispositif médical ni un professionnel de santé », **explicitement acquitté** (AC3) ;
- question filtre profils à risque : mineur, grossesse, pathologie déclarée, antécédents de troubles alimentaires (AC3) ;
- **consentement explicite distinct** au traitement des données de santé (FC, sommeil, poids, douleur), recueilli **avant toute saisie** de ces données (AC3) ;
- jamais de déficit calorique agressif ni de perte de poids sans plancher de sécurité (AC11) ;
- orientation vers un professionnel de santé sur douleur persistante ou aiguë (AC9).

Ces données relèvent de l'article 9 RGPD (catégories particulières). L'ADR-002 introduit par ailleurs un LLM tiers, qui est un **sous-traitant** au sens du RGPD.

Note : ce document est une décision d'architecture technique, pas un avis juridique. Une validation par un conseil juridique est requise avant ouverture commerciale.

## Décision

### 1. Consentements versionnés et horodatés, jamais un booléen

Deux tables :

- `consent_documents (code, version, locale, body_md, checksum, published_at, is_current)` — le **texte exact** de chaque document, immuable et versionné : `medical_disclaimer`, `health_data_processing`, `terms`, `privacy`.
- `consents (user_id, document_code, document_version, locale, granted, granted_at, revoked_at, ip_hash, user_agent)` — **append-only**. Un retrait est une nouvelle ligne, pas une mise à jour.

On peut donc prouver *quelle version exacte du texte* l'utilisateur a acquittée, *quand*, et restituer ce texte. Un stockage sous forme de `profiles.consent_health = true` serait indéfendable en cas de contrôle.

**Révision 2026-08-07** — une preuve de consentement que l'utilisateur peut fabriquer lui-même n'est pas une preuve. `consents` porte désormais une **FK composite** vers `consent_documents (code, version, locale)`, et **aucune policy `INSERT` n'est offerte à `authenticated`** : l'écriture passe exclusivement par `service_role`, depuis une route API qui résout la version courante (`is_current`) et calcule `ip_hash` / `user_agent` à partir de la requête. Détail et justification : ADR-012 §1.

### 2. Le consentement est un verrou technique, pas une case à cocher

Le consentement `health_data_processing` **actif** est une précondition serveur, vérifiée dans le Route Handler et **doublée d'une policy RLS** sur les tables porteuses de données de santé (`session_logs`, `body_metrics`, `pain_episodes`, `risk_flags`, `athlete_profiles`, `nutrition_checkins`) :

```sql
create policy "session_logs_insert_own" on session_logs
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and public.has_active_consent((select auth.uid()), 'health_data_processing')
  );
```

L'AC3 (« recueilli séparément **avant toute saisie** de ces données ») devient une garantie de la base de données, impossible à contourner par un oubli applicatif.

**Révision 2026-08-07** — le contrôle portait uniquement sur l'`INSERT`. Un utilisateur ayant retiré son consentement pouvait continuer à **modifier** ses données de santé existantes : le traitement se poursuivait sans base légale. `has_active_consent()` est désormais exigé dans le `with check` des policies **`UPDATE`** de `athlete_profiles`, `session_logs` et `nutrition_checkins` (ADR-012 §2).

Le disclaimer médical (`medical_disclaimer`) est traité comme un **acquittement distinct et séparé du consentement de traitement** — deux écrans, deux enregistrements, conformément à l'exigence de granularité du consentement et aux maquettes (écran Onboarding disclaimer ≠ écran Onboarding consentement RGPD).

### 3. Étanchéité de l'onboarding conversationnel

L'onboarding est un chat : l'utilisateur peut mentionner une pathologie **avant** l'écran de consentement. Décision :

- l'écran disclaimer + l'écran consentement sont des **étapes bloquantes du parcours**, positionnées avant toute question susceptible de collecter une donnée de santé (`onboarding_sessions.current_step`), conformément aux notes UX de la fiche (« étapes explicites et non noyées dans le flux conversationnel ») ;
- si une donnée de santé est malgré tout détectée dans un message libre avant consentement, elle **n'est pas persistée en champ structuré** : le message reste dans `onboarding_messages` (contenu conversationnel), et l'extraction structurée est différée jusqu'au consentement. `onboarding_messages` porte donc `contains_health_data boolean` et suit la même rétention que les données de santé.

### 4. Minimisation vers le LLM

Le sous-traitant LLM ne reçoit **jamais** :

- d'identifiant direct (nom, e-mail, `user_id` — un identifiant de corrélation éphémère par session est utilisé) ;
- de données de santé non nécessaires au tour de conversation en cours ;
- l'historique brut de la base.

Pour la rédaction des explications (ADR-002 §2), le LLM reçoit **uniquement les `DecisionTrace` sérialisées** — c'est-à-dire des valeurs déjà agrégées et strictement nécessaires au texte à produire, jamais l'historique complet.

Exigences sur le fournisseur, à valider par `devops` avant mise en production :

- **traitement dans l'UE**, DPA signé, **absence d'entraînement** sur les données transmises, rétention nulle ou courte côté fournisseur ;
- fournisseur abstrait derrière un port `LlmProvider` dans `@hybride/coach-llm` : en changer est un changement d'adaptateur, pas une refonte.

Les prompts et complétions ne sont **pas** stockés intégralement : `explanations.llm_prompt_hash` seul est conservé pour l'audit. Les payloads complets, si activés en debug, vont dans une table dédiée à rétention courte (30 jours) et jamais en production par défaut.

### 5. Hébergement et localisation

- Supabase **région UE** (Paris `eu-west-3` ou Francfort `eu-central-1`).
- Vercel : fonctions en région UE (`fra1` / `cdg1`) — pas d'exécution edge globale sur les routes touchant des données de santé.
- Brevo (e-mail) : opérateur français, données UE.
- Chiffrement au repos (Supabase) et en transit. Les champs de texte libre les plus sensibles (`risk_flags.notes`, description de pathologie) sont chiffrés applicativement via `pgcrypto` avec une clé gérée hors base.

### 6. Profils à risque : restriction comportementale portée par les données

`risk_flags` porte un objet `restrictions jsonb` consommé par le moteur à règles et par le service LLM :

```jsonc
{
  "block_caloric_deficit": true,        // antécédents de TCA, grossesse (AC3, AC11)
  "block_weight_loss_guidance": true,
  "cap_intensity": true,
  "require_medical_referral_notice": true,
  "block_plan_generation": false        // mineur : à trancher (voir question ouverte)
}
```

Le moteur applique ces restrictions comme des **garde-fous durs** (`is_hard_guardrail = true`), au même titre que l'AC8, et émet une `decision_trace` à chaque application. Le comportement dégradé de l'AC3 est donc traçable et testable.

### 7. Droits des personnes

- **Accès / portabilité** : `GET /api/v1/account/export` — export JSON complet (profil, plans, logs, explications, traces, consentements).
- **Effacement** : `POST /api/v1/account/delete` — voir §8, qui décrit le mécanisme retenu et ce qui est conservé.
- **Retrait du consentement santé** : arrête la collecte **et la modification** des données de santé existantes (policies `INSERT` et `UPDATE`), purge ces données, et met le coach en mode dégradé explicite (le plan n'est plus ajusté sur les signaux de santé) — jamais un échec silencieux. Le blocage en écriture doit être **expliqué** par l'UI, pas subi (question ouverte n°4 de `08-architecture.md` §12).
- **Rétention** : données de santé conservées tant que le compte est actif + 12 mois après la dernière activité (à confirmer juridiquement) ; `onboarding_messages` purgés après 90 jours une fois le profil structuré confirmé ; registre `consents` — voir §8.

### 8. Effacement : mécanisme technique et ce qui survit

> Ajouté le 2026-08-07, en réponse à un point remonté par `code-reviewer` sur le Lot L1.

**Le problème.** L'ADR-006 impose l'immuabilité de l'audit, matérialisée par un trigger `forbid_mutation()` qui rejette tout `UPDATE`/`DELETE` sur `consents`, `plan_versions` et `decision_traces`, y compris pour `service_role`. Ces trois tables portaient par ailleurs `user_id references auth.users(id) on delete cascade`. Résultat : `delete from auth.users` déclenchait une cascade `DELETE` que le trigger bloquait, et l'anonymisation par `update ... set user_id = null` était bloquée de la même façon (`on delete set null` est implémenté par Postgres via un `UPDATE`). **Les deux voies d'exercice du droit à l'effacement (art. 17) étaient fermées simultanément** — l'immuabilité, pensée comme une garantie, produisait une non-conformité.

**Décision 1 — l'effacement est une suppression réelle, pas une anonymisation de traces.**

La version initiale de cet ADR prévoyait « l'anonymisation (dissociation de `user_id`) des traces conservées à fin statistique ». Cette formulation est abandonnée. Des `decision_traces` privées de leur `user_id` restent reliées entre elles par `engine_run_id` et `plan_version_id`, et leur champ `inputs_used` contient des valeurs de santé datées (RPE, douleur, poids, sommeil) : le jeu résultant permet d'isoler un individu. C'est de la **pseudonymisation**, qui reste une donnée personnelle au sens du RGPD, et non de l'anonymisation. La conserver sous couvert de statistiques serait une non-conformité présentée comme une bonne pratique. Aucun besoin statistique n'est d'ailleurs formulé à ce stade du produit ; le jour où il le sera, il sera servi par des agrégats non personnels calculés en amont, pas par la rétention de traces individuelles.

`POST /api/v1/account/delete` supprime donc l'intégralité des données personnelles, par cascade depuis `auth.users`.

**Décision 2 — le registre `consents` survit, pseudonymisé. C'est un choix assumé.**

Conserver la preuve du consentement après la disparition du compte n'est pas un effet de bord du trigger : c'est une décision. Motifs :

- l'`accountability` (art. 5.2) et l'obligation de **démontrer** que le consentement a été recueilli (art. 7.1) survivent à la relation ;
- l'art. 17.3.e réserve explicitement la conservation nécessaire à la constatation, l'exercice ou la défense de droits en justice ;
- supprimer la preuve en même temps que le compte reviendrait à ne plus pouvoir répondre à une réclamation portant précisément sur la période où la personne était utilisatrice.

Mise en œuvre :

- `consents.user_id` **perd sa FK vers `auth.users`** : la ligne n'est plus emportée par la cascade et `user_id` devient un identifiant pseudonyme ;
- lors de l'effacement, `ip_hash` et `user_agent` sont effacés (ce sont les derniers résidus identifiants une fois le lien rompu ; ils n'ajoutent rien au fait probant) et `subject_erased_at` est horodaté ;
- ce qui est conservé se limite au fait juridiquement utile : quel document, quelle version, quelle locale, accordé ou retiré, quand.

**Décision 3 — une dérogation unique, scopée, au trigger d'immuabilité.**

`forbid_mutation()` autorise la mutation si et seulement si **les deux** conditions suivantes sont réunies :

1. le GUC de session `app.erasure_user_id` vaut exactement le `user_id` de la ligne mutée ;
2. le rôle effectif est membre de `service_role` (`pg_has_role(current_user, 'service_role', 'member')`).

La seconde condition n'est pas décorative. En Postgres, un GUC de namespace applicatif (`app.*`) est un *placeholder* que **n'importe quel rôle peut positionner dans sa propre session** : s'appuyer sur le seul GUC serait une fausse barrière. PostgREST n'expose pas `set_config` (fonction de `pg_catalog`, hors schéma exposé), mais cette absence d'exposition est une propriété de l'outil, pas une garantie de la base — le contrôle de rôle, lui, est dans la base. Un test dédié vérifie explicitement les deux angles (T4 de `docs/db-schema.md`).

Le choix d'un GUC **portant l'`user_id`** plutôt qu'un booléen `app.erasure_in_progress` est délibéré : un drapeau global transformerait le contexte d'effacement en interrupteur qui déverrouille l'audit de **tous** les utilisateurs le temps d'une transaction. Ici, le déverrouillage ne concerne jamais qu'une seule personne.

**Décision 4 — une seule porte d'entrée.**

Le GUC n'est positionné que par `public.erase_account(uuid)` : `security definer`, `set local` (portée transaction, jamais de fuite), révoquée de `public`/`anon`/`authenticated`, `EXECUTE` accordé au seul `service_role`. La fonction re-vérifie le rôle appelant en interne (défense en profondeur si un GRANT était accidentellement élargi), dépersonnalise `consents`, puis supprime `auth.users`. Elle est la **seule** voie d'écriture sur les tables immuables.

**Effets de bord traités.** Deux FK sans action de suppression bloquaient l'effacement d'un compte `staff` : `rulesets.published_by` et `plan_reviews.reviewer_id` passent en `on delete set null` — la publication d'un ruleset et une revue qualité sont des artefacts d'exploitation qui doivent survivre au départ de leur auteur.

**Non couvert.** `stripe_events` n'a pas de `user_id` et n'est pas traitée par `erase_account()` alors que ses payloads contiennent des données personnelles : rétention et purge à cadrer avant ouverture commerciale (question ouverte n°9 de `08-architecture.md` §12).

## Conséquences

**Positives**

- L'AC3 est garantie au niveau base de données, pas seulement au niveau UI — et désormais sur tout le cycle de vie de la donnée, pas seulement à sa création.
- Un utilisateur ne peut plus fabriquer sa propre preuve de consentement aux données de santé.
- Le droit à l'effacement est réellement exerçable, par une fonction unique, testable, et dont l'usage est auditable.
- Le registre des traitements et la réponse à une demande d'exercice de droits sont produits à partir de données déjà structurées.
- Changer de fournisseur LLM (contrainte de conformité ou de coût) est un changement d'adaptateur.

**Négatives / à surveiller**

- Les policies RLS conditionnées au consentement ajoutent un appel de fonction sur chaque insertion **et chaque mise à jour** : `has_active_consent` doit rester `stable`, `security definer`, et indexée sur `(user_id, document_code, granted_at desc)`.
- L'immuabilité de l'audit n'est plus absolue : elle est conditionnée à un contexte. C'est le prix de la conformité, mais cela crée une surface à protéger — le test T4 (`docs/db-schema.md`) est donc un test de sécurité, pas un test de confort.
- Le registre `consents` croît sans limite tant que sa durée de conservation n'est pas fixée juridiquement.
- L'écriture des consentements devient serveur-seule : le seed de `consent_documents` est un prérequis dur au parcours d'onboarding (sans document `is_current`, la FK composite rejette tout consentement).
- Le mode dégradé après retrait de consentement est un chemin produit à part entière, à spécifier avec `spec-writer` (non couvert par les 14 AC) — d'autant qu'il bloque désormais aussi la modification.
- Un DPO / conseil juridique doit valider : base légale, durées de rétention, mentions, la question du mineur, et la conservation du registre de consentement.

## Alternatives écartées

| Alternative | Raison du rejet |
|---|---|
| Booléens de consentement sur `profiles` | Non probant (aucune trace de la version du texte ni de la date), non réversible proprement. |
| Consentement unique global couvrant disclaimer + santé | Contredit l'AC3 (« recueilli séparément ») et l'exigence RGPD de granularité. |
| Contrôle du consentement uniquement applicatif | Un seul oubli dans un handler = collecte de données de santé sans base légale. Le contrôle doit être au plus près de la donnée. |
| Envoi de l'historique complet au LLM pour de meilleures explications | Violation du principe de minimisation, pour un gain de qualité marginal : les `DecisionTrace` contiennent déjà tout le nécessaire. |
| Conserver les `decision_traces` avec `user_id` nulifié « à fin statistique » | Pseudonymisation présentée comme anonymisation : les traces restent corrélables et réidentifiantes. Aucun besoin statistique formulé à ce stade. |
| Drapeau booléen `app.erasure_in_progress` pour le contexte d'effacement | Déverrouille l'audit de tous les utilisateurs le temps de la transaction. Le GUC porte donc l'`user_id`. |
| GUC de session comme seule condition de dérogation | Un GUC applicatif est positionnable par n'importe quel rôle : ce n'est pas une barrière. La condition de rôle est indispensable. |
| Supprimer aussi le registre `consents` à l'effacement | Rend impossible de démontrer le consentement recueilli sur la période d'usage (art. 5.2, 7.1), et de se défendre sur une réclamation postérieure. |
| Table `consent_ledger` séparée, copiée à l'effacement | Duplique le modèle et introduit un risque de divergence entre le registre vivant et le registre d'archive, pour le même résultat. |

## Questions ouvertes relayées au fondateur

> 1. **Mineur** : refus d'inscription pur et simple (option la plus sûre juridiquement, recommandée) ou parcours dégradé avec consentement parental ? Non tranché par la fiche.
> 2. Durées de rétention exactes des données de santé, à valider juridiquement.
> 3. ~~Fournisseur LLM retenu et DPA associé (exigence : traitement UE, pas d'entraînement sur les données).~~ **Tranché le 2026-08-06 : Mistral AI.** Entité française, infrastructure UE par défaut, DPA aligné RGPD dès la base (pas un simple avenant), pas d'entraînement sur les données API, rétention 30 jours glissants. Le DPA doit être formellement signé par `devops`/le fondateur avant tout appel en production (le port `LlmProvider` de `@hybride/coach-llm` rend un changement ultérieur peu coûteux si besoin). Sources : [Data Processing Addendum — Mistral AI](https://legal.mistral.ai/terms/data-processing-addendum), [Privacy and data controls — Mistral Docs](https://docs.mistral.ai/admin/monitor-comply/privacy-data-controls).
> 4. ~~**(2026-08-07) Conservation du registre `consents` après suppression de compte**~~ **Tranché par le fondateur le 2026-08-07 : 5 ans** à compter du dernier événement de consentement (prescription de droit commun, art. 2224 code civil), conformément à l'hypothèse de travail de l'architecture. Le principe de conservation (et non simplement la durée) reste à faire valider par un conseil juridique avant ouverture commerciale. Un job de purge à 5 ans peut maintenant être écrit sur cette base.
> 5. **(2026-08-07) Rétention de `stripe_events`** : les payloads Stripe bruts contiennent des données personnelles et ne sont pas couverts par l'effacement. Durée de conservation à fixer (l'idempotence webhook n'exige que quelques semaines).
