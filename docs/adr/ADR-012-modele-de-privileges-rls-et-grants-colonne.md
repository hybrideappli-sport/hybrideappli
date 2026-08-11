# ADR-012 — Modèle de privilèges : RLS pour les lignes, GRANTs colonne pour les champs

- **Statut** : Accepté
- **Date** : 2026-08-07
- **Décideur** : `architect`
- **Portée** : Projet — sécurité / schéma
- **Dépend de** : ADR-006 (auditabilité), ADR-010 (données de santé)
- **Déclencheur** : revue `code-reviewer` du Lot L1 de l'US-01 (commit `a028eb4`) — 3 des 4 points remontés touchent au DDL canonique

---

## Contexte

L'architecture initiale posait une règle simple : « RLS activée sur 100 % des tables, avec au moins une policy explicite ». La revue du premier lot livré montre que cette règle, prise seule, laisse passer trois classes de failles — non par erreur d'implémentation, mais par insuffisance du DDL canonique lui-même.

**a) RLS ne dit rien de la provenance d'une valeur.** La policy `consents_insert_own` autorisait `authenticated` à insérer `{user_id: auth.uid(), document_code, document_version, granted}` en texte libre. Rien ne vérifiait que le couple `(code, version, locale)` existait dans `consent_documents`, ni que l'utilisateur avait vu le texte. Un utilisateur pouvait donc **se délivrer lui-même** sa preuve de consentement au traitement de données de santé (art. 9 RGPD) — un consentement dont il est le seul auteur ne prouve rien.

**b) RLS s'évalue à l'écriture, pas dans la durée.** Les policies `INSERT` des tables de santé exigeaient `has_active_consent(...)` ; les policies `UPDATE` correspondantes ne l'exigeaient pas. Un utilisateur qui retirait son consentement pouvait continuer à modifier ses données de santé : le traitement se poursuivait sans base légale, alors même que le verrou censé l'empêcher existait à quelques lignes de là.

**c) RLS ne sait pas restreindre les colonnes.** Une policy `UPDATE` autorise ou refuse la mutation d'une **ligne** ; elle ne peut pas dire « seule cette colonne ». Combinée à un `alter default privileges ... grant update on tables to authenticated` en table pleine largeur, la policy `plan_diffs_ack_own` — écrite pour permettre à l'utilisateur d'acquitter un diff — lui permettait en réalité de réécrire `items jsonb`, c'est-à-dire le contenu produit par le moteur à règles, `decisionTraceId` compris. Le même mécanisme rendait `notifications.title`/`body`/`payload` réécrivables au lieu du seul `read_at`, et `objectives.feasibility` — le verdict AC2 du moteur — modifiable par celui-là même qu'il concerne.

Le point commun des trois : **une policy RLS a été lue comme une autorisation métier alors qu'elle n'exprime qu'un prédicat de ligne.** L'écart entre l'intention (« il peut acquitter ») et l'effet (« il peut tout réécrire ») est invisible à la relecture du DDL.

## Décision

### 1. L'écriture des consentements quitte le client

Deux mesures cumulatives, l'une structurelle, l'autre de surface :

```sql
-- FK composite : un consentement ne peut référencer qu'un document réellement publié
constraint consents_document_fk
  foreign key (document_code, document_version, locale)
  references consent_documents (code, version, locale) on delete restrict
```

et **suppression de la policy `consents_insert_own`**. `consents` n'offre plus aucune policy d'écriture à `authenticated` : l'insertion passe exclusivement par `service_role`, depuis `POST /api/v1/consents` et `POST /api/v1/onboarding/session/:id/disclaimer`, qui :

- résolvent eux-mêmes la version courante du document (`is_current`) au lieu de faire confiance au client ;
- calculent `ip_hash` et `user_agent` à partir de la requête HTTP — ces deux champs n'ont de valeur probante que si le client ne les fournit pas ;
- refusent l'enregistrement si aucun document courant n'existe pour `(code, locale)`.

La FK reste indispensable même une fois l'écriture serveur-seule : elle protège contre une erreur de la route API elle-même (faute de frappe sur un code, version périmée codée en dur), et elle documente l'invariant dans le schéma plutôt que dans un handler.

`has_active_consent()` n'est **pas** modifiée : l'existence du document est désormais garantie par la FK, et exiger `is_current` dans la fonction périmerait instantanément le consentement de tous les utilisateurs à chaque publication d'une nouvelle version, les enfermant hors de leurs propres données. Le re-consentement sur nouvelle version est un **parcours produit** à spécifier, pas un effet de bord d'un `select`.

### 2. Le consentement santé conditionne aussi la modification

`has_active_consent(auth.uid(), 'health_data_processing')` est ajouté au `with check` des policies `UPDATE` de `athlete_profiles`, `session_logs` et — extension au-delà du point remonté — `nutrition_checkins`, dont la policy `for all` ne portait aucun contrôle. `nutrition_checkins.energy` est un indicateur de fatigue exploité par le diagnostic de surcharge (AC6) : le traiter autrement que comme une donnée de santé serait incohérent.

La condition reste dans le `with check` et non dans le `using` : la lecture et le ciblage des lignes ne changent pas, seule la production d'une nouvelle version de la ligne est fermée. L'utilisateur qui a retiré son consentement voit ses données, ne peut plus les modifier, et l'UI doit le lui **expliquer** (question ouverte n°4 de `08-architecture.md` §12).

`body_metrics` et `risk_flags` n'ont volontairement aucune policy `UPDATE` : une mesure se corrige par une nouvelle ligne.

### 3. `UPDATE` n'est jamais accordé par défaut

La stratégie de privilèges par défaut est inversée :

```sql
alter default privileges in schema public
  grant select, insert, delete on tables to authenticated;   -- plus d'UPDATE
```

Justification de la ligne de partage : `SELECT`, `INSERT` et `DELETE` sont **intégralement** exprimables par une policy RLS — pour ces trois verbes, RLS est une barrière complète et le GRANT par défaut ne crée aucun angle mort. `UPDATE` est le seul verbe dont RLS ne couvre qu'une moitié : elle contrôle *quelles lignes*, jamais *quelles colonnes*. Il est donc accordé explicitement, table par table, et au niveau colonne dès que seule une partie de la ligne est légitimement modifiable par l'utilisateur :

| Table | GRANT `UPDATE` accordé à `authenticated` | Motif de l'exclusion |
|---|---|---|
| `plan_diffs` | `(acknowledged_at)` | `items` est produit par le moteur (ADR-005 §4) |
| `notifications` | `(read_at)` | `title`, `body`, `payload`, `deep_link` sont produits par le serveur |
| `objectives` | `(label, target_date, target_metric, sport_id, kind)` | `status`, `feasibility`, `feasibility_trace_id`, `proposed_alternative`, `user_decision` portent le verdict AC2 |
| `session_logs` | toutes sauf `source`, `user_id`, `created_at` | un client ne se déclare pas `connected` (AC12 / F2) |
| `athlete_profiles` | toutes sauf `data_regime`, `user_id`, horodatages | `data_regime` est décidé côté serveur |
| `profiles` | toutes sauf `role` | interdiction structurelle de l'escalade vers `staff` |
| `nutrition_checkins` | `(adherence, energy, comment, nutrition_day_id)` | — |
| `athlete_sports`, `availability_slots`, `push_subscriptions`, `onboarding_sessions`, `plan_reviews` | table entière | contenu intégralement déclaratif ou gardé par `is_staff()` |
| toutes les autres | **aucun** | tables du moteur, référentiels, facturation, quota, file de jobs |

Sur `profiles`, le GRANT colonne remplace le garde-fou `with check (role = 'athlete')`, qui avait par ailleurs l'effet indésirable d'empêcher un compte `staff` de modifier son propre profil.

`onboarding_sessions` conserve un `UPDATE` pleine largeur, assumé : `profile_draft` est un **brouillon sans autorité**, que l'AC1 impose de faire revalider explicitement par l'utilisateur à l'étape `complete`. `onboarding_messages` perd le sien : c'est un journal conversationnel, append-only de fait.

**Propriété recherchée : l'échec bruyant.** Avec un `UPDATE` accordé par défaut, une table oubliée est sur-autorisée en silence — le bug se découvre en revue de sécurité, ou jamais. Avec le défaut inversé, une table oubliée renvoie `permission denied` au premier appel, en développement. On échange un risque silencieux contre une friction visible.

### 4. `EXECUTE` n'est pas accordé à `PUBLIC`

Postgres accorde `EXECUTE` à `PUBLIC` à la création de toute fonction. Combiné à la déclaration `alter default privileges ... grant execute on functions to authenticated, anon, service_role`, cela signifiait que **toute fonction `security definer` créée par une migration ultérieure serait appelable par `authenticated` dès sa création** — un problème qui n'existait pas au Lot L1 et qui serait apparu exactement au moment où il fait le plus de dégâts, avec `erase_account()`.

```sql
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public grant execute on functions to service_role;
-- puis, explicitement :
grant execute on function public.has_active_consent(uuid, text) to authenticated;
grant execute on function public.is_staff() to authenticated;
```

Toute fonction `security definer` est en outre explicitement révoquée de `public`, `anon` et `authenticated` sur sa propre ligne — redondant avec le défaut, lisible au point d'usage.

### 5. Ces garanties sont testées, pas seulement écrites

Les invariants introduits ici ne se voient pas à la relecture d'une policy. Ils sont donc couverts par des tests d'intégration exécutés sur base réelle (liste complète en fin de `docs/db-schema.md`), dont notamment :

- écriture `plan_diffs.items` / `notifications.title` / `objectives.feasibility` par `authenticated` ⇒ `permission denied for column` ;
- acquittement légitime (`acknowledged_at`, `read_at`) ⇒ accepté sur ses lignes, refusé sur celles d'un tiers ;
- `UPDATE` d'une donnée de santé après retrait de consentement ⇒ rejeté ;
- `INSERT` dans `consents` par `authenticated` ⇒ rejeté ; par `service_role` avec un document inexistant ⇒ rejeté par la FK ;
- **inventaire** : requête sur `information_schema.column_privileges` vérifiant qu'aucune colonne hors liste blanche n'accorde `UPDATE` à `authenticated`. C'est ce test-là qui empêche la régression d'ensemble, les autres ne couvrant que les cas connus.

## Conséquences

**Positives**

- L'écart entre l'intention d'une policy et son effet réel disparaît : ce qu'un utilisateur peut écrire est énuméré, colonne par colonne, dans le DDL.
- Un consentement au traitement de données de santé ne peut plus être fabriqué par son propre sujet.
- Le retrait de consentement produit enfin l'effet annoncé par l'ADR-010 sur toute la durée de vie de la donnée.
- Toute table future part fermée en écriture partielle : l'ouverture est un acte délibéré.

**Négatives / à surveiller**

- Ajouter une colonne à une table dotée d'un GRANT colonne ne la rend **pas** modifiable : il faut penser à étendre le GRANT. C'est le prix du modèle, et le test d'inventaire ne le détecte pas (il vérifie l'absence d'excès, pas l'absence de manque) — l'échec sera un `permission denied` en développement.
- Le DDL devient plus verbeux : chaque table d'écriture porte désormais une ligne `grant update`.
- Le seed de `consent_documents` devient un prérequis dur du parcours d'onboarding.
- Le re-consentement lors de la publication d'une nouvelle version de document reste **non spécifié** : `has_active_consent()` ignore volontairement `is_current`. À cadrer avec `spec-writer` avant la première révision d'un texte juridique.

## Alternatives écartées

| Alternative | Raison du rejet |
|---|---|
| Conserver le `grant update` par défaut et ne corriger que `plan_diffs` et `notifications` | Traite les deux cas connus, laisse la cause intacte : la table suivante reproduira la faille, en silence. |
| Retirer aussi `INSERT` et `DELETE` du défaut, par symétrie | Pas de bénéfice : RLS couvre intégralement ces deux verbes. La règle « on ferme par défaut ce que RLS ne sait pas exprimer » est plus enseignable qu'une fermeture générale sans motif. |
| Restreindre les colonnes par des triggers `BEFORE UPDATE` comparant `OLD`/`NEW` | Reproduit en PL/pgSQL ce que le système de privilèges fait nativement, avec un coût d'exécution et un risque d'oubli sur chaque table. |
| Retirer `UPDATE` à `authenticated` sur `plan_diffs`/`notifications` et faire passer l'acquittement par une route `service_role` | Fonctionne, mais transforme deux gestes triviaux en aller-retours serveur ; le GRANT colonne exprime exactement l'intention sans code supplémentaire. |
| Faire vérifier `is_current` par `has_active_consent()` | Périme le consentement de tous les utilisateurs à chaque publication d'un texte, et les enferme hors de leurs données jusqu'au re-consentement. Le re-consentement doit être un parcours, pas une panne. |
| Vues `security_invoker` exposant les seules colonnes modifiables | Multiplie les objets et les types générés côté TypeScript pour un résultat que deux GRANTs obtiennent. |
