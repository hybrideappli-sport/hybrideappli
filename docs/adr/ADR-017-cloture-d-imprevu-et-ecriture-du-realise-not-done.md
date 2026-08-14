# ADR-017 — Clôture d'imprévu : écriture serveur d'un `session_log` `not_done`, sans ajustement de charge

- **Statut** : Accepté — **amendé le 2026-08-12** (§8 et §9, restitution et acquittement du `not_done` automatique)
- **Date** : 2026-08-12
- **Décideur** : `architect`
- **Portée** : Projet — frontière entre l'événement temporel (F3) et le réalisé (F1)
- **Dépend de** : ADR-004 (le réalisé ne se supprime pas), ADR-010 / ADR-012 (consentement santé, modèle de privilèges), ADR-011 (file de jobs), ADR-015 (charge réalisée), ADR-016 (modèle de placement)
- **Feature déclenchante** : US-03, AC3 dernier `AND` — décision du fondateur du 2026-08-11, dont la fiche §5 délègue explicitement le **déclencheur technique** à `architect`
- **Amendement du 2026-08-12** : entrée `11-design-notes.md` §3 et §8 (points 1 et 2), en réponse à la question ouverte n°1 de cet ADR (reprise en `08-architecture.md` §12, question 17). Voir **§8** et **§9** ci-dessous.

---

## Contexte

Le fondateur a tranché deux choses le 2026-08-11, et elles tirent dans des directions opposées :

1. le signalement d'imprévu est **un événement temporel piloté par F3** — il ne déclenche **jamais** lui-même un ajustement de charge ;
2. si la séance replacée n'est **finalement pas réalisée**, un `session_log` (`completion = 'not_done'`) doit être créé, pour que la révision hebdomadaire (AC5) et la détection de stagnation (AC6, diagnostic `nonadherence`) de la F1 restent informées de l'adhérence réelle.

La fiche §5 est explicite : *« `architect` définit le déclencheur technique exact de cette écriture (ex. à l'expiration de la fenêtre de replacement) »*.

Quatre contraintes héritées encadrent la réponse :

- **`session_logs` est une table de données de santé.** Ses policies `INSERT`/`UPDATE` sont conditionnées à `has_active_consent(user, 'health_data_processing')` (ADR-010 §2, ADR-012 §2) — mais une écriture `service_role` **contourne RLS**, comme l'US-02 l'a constaté (ADR-013 §5). Écrire au nom de l'utilisateur sans garde explicite reproduirait la faille que le trigger `enforce_connected_source_consents()` a fermée pour l'import tiers.
- **`INSERT` est restreint colonne par colonne** depuis ADR-015 §4 ; `load_units` n'est écrite que par `finalizeSessionLogLoad()`.
- **La F1 ne crée aucun `not_done` automatique.** Une séance simplement non renseignée reste sans log : le silence de l'utilisateur n'est pas une déclaration. C'est cohérent avec le refus de tout rattrapage cumulatif (AC4 F1) et avec la reprojection depuis la situation réelle (ADR-004 §1).
- **`applyDailyLog()` déclenche un ajustement de plan synchrone** (ADR-011 §6). L'emprunter ferait exactement ce que la décision n°1 interdit.

---

## Décision

### 1. Le déclencheur est un **job de clôture quotidien**, pas la fin de la journée civile ni le signalement lui-même

Un nouveau `kind` dans la file existante (ADR-011), sans infrastructure nouvelle :

```
Cron horaire ──► /cron/enqueue-schedule-closeouts
                     │  enrôle les utilisateurs dont l'heure locale vient d'atteindre
                     │  planning.closeout_local_hour (défaut 03:00)
                     ▼
       job_queue  kind = 'schedule_closeout'
                  idempotency_key = 'schedule_closeout:{user}:{date locale J-1}'
                     │
        drain-jobs (5 min) ────► closeOutScheduleIncidents(user, localDate)
```

Trois raisons de ne pas clôturer plus tôt :

- **La grâce est nécessaire.** Une séance placée à 20 h 30 est loguée à 21 h 15, parfois le lendemain matin. Clôturer à minuit produirait des `not_done` faux, donc un diagnostic d'inobservance faux (AC6) — un mensonge du coach sur le dos de l'utilisateur.
- **La synchronisation tierce a besoin de temps.** Un webhook Strava (US-02) peut arriver quelques minutes après la séance ; le filet de réconciliation, lui, tourne quotidiennement. 03 h locale laisse passer le temps réel comme le rattrapage.
- **Le fuseau compte**, exactement comme pour le rituel dominical (ADR-011 §1) : `profiles.timezone`, jamais l'heure du serveur.

### 2. La clôture porte sur la **date de destination**, pas sur la date signalée

Pour chaque `schedule_incidents` ouvert (`closed_out_at is null`) :

```
date de clôture = scheduled_date du placement COURANT portant cet incident, si ce placement existe
                  et n'est pas 'cancelled_week'
                = reported_for_date sinon (annulation, ou séance disparue du plan après régénération)
```

Un imprévu signalé mardi et replacé jeudi ne se clôt que **vendredi 3 h locale**. Sans cette règle, toute séance replacée vers l'avant serait déclarée non réalisée avant même d'avoir eu lieu.

### 3. Quatre issues, toutes journalisées

`schedule_incidents.closeout_outcome` (enum) rend la clôture auditable au lieu d'être un effet de bord silencieux :

| Issue | Condition | Effet |
|---|---|---|
| `already_logged` | un `session_log` non exclu (`excluded_at is null`, ADR-015 §3) existe pour l'utilisateur à la date de clôture | **Aucune écriture.** La séance a eu lieu, ou l'utilisateur l'a déjà déclarée |
| `log_created` | aucun log à cette date **et** consentement santé actif | Insertion d'un `session_log` `completion = 'not_done'`, `load_units = 0` |
| `skipped_no_consent` | consentement `health_data_processing` retiré ou absent | **Aucune écriture.** Cohérent avec le mode dégradé (§12 q4 de `08-architecture.md`) : un retrait de consentement ferme l'écriture de santé, y compris quand c'est le serveur qui écrit |
| `skipped_session_absent` | aucun placement courant **et** la séance d'origine n'appartient plus à la version active | **Aucune écriture.** Le moteur a reprojeté la semaine ; il n'y a plus de séance à déclarer non réalisée |

Dans les quatre cas, `closed_out_at` est renseigné : un imprévu n'est traité qu'une fois. L'idempotence est doublée par la clé métier du job.

### 4. Le log créé est un log serveur, écrit comme tel

```
user_id            = incident.user_id
planned_session_id = placement courant → planned_session_id, sinon incident.planned_session_id (nullable)
logged_date        = date de clôture
completion         = 'not_done'
not_done_reason    = « Créneau signalé indisponible, séance non replacée cette semaine. »   (annulation)
                   | « Séance déplacée après un imprévu, non réalisée à son nouvel horaire. » (replacement)
source             = 'declared'          -- ADR-015 §3 : `source` reste le journal d'ACQUISITION
load_units         = 0                   -- via finalizeSessionLogLoad(), ADR-015 §1
pain               = 'none'              -- aucune donnée ressentie n'est inventée
```

Le lien de retour est porté par `schedule_incidents.resulting_session_log_id`. **Aucune colonne n'est ajoutée à `session_logs`** : la traçabilité vit du côté F3, ce qui laisse la table du réalisé exactement telle que la F1 et l'US-02 l'ont laissée. **L'amendement §8 ne change rien à cette propriété** : c'est ce même lien, et lui seul, qui sert de discriminant.

`source = 'declared'` est un choix assumé : l'utilisateur a bien *déclaré* quelque chose — l'empêchement. Introduire une troisième valeur (`inferred`) ferait de l'enum `data_source` un fourre-tout et casserait la lecture binaire de provenance d'ADR-015 §3.

### 5. La clôture n'emprunte **pas** `applyDailyLog()`

Aucun ajustement de plan, aucune régénération, aucun `engine_runs`, aucune explication LLM. Le job écrit le réalisé et s'arrête. La décision du fondateur (« événement temporel, jamais un ajustement de charge ») devient une propriété du chemin de code : `closeOutScheduleIncidents()` n'importe pas `regeneratePlan`.

Ce que le log **fait** malgré tout, et c'est tout l'objet de la décision produit : il entre dans `buildPlanningContext().history.sessionLogs`, donc dans la révision hebdomadaire du dimanche (AC5) et dans `evaluateStagnation()` (AC6). La conséquence est **différée et passée par le moteur**, jamais immédiate et jamais décidée par la F3. C'est exactement l'asymétrie d'ADR-005 §5 : les baisses immédiates naissent d'un signal de fatigue déclaré, pas d'un empêchement d'agenda.

### 6. Le périmètre est **strictement** l'imprévu signalé

Une séance non réalisée **sans** imprévu signalé ne produit toujours aucun log. La F3 ne change pas la doctrine de la F1 sur le silence de l'utilisateur : elle n'écrit du réalisé que là où l'utilisateur a lui-même appuyé sur un bouton. Étendre la clôture à toutes les séances non loguées serait une décision produit majeure (elle rendrait le diagnostic `nonadherence` structurellement plus sévère), et elle n'a été prise par personne.

### 7. Garde anti double-comptage avec l'US-02

Le test « un `session_log` non exclu existe à cette date » porte sur **l'utilisateur et la date**, pas sur `planned_session_id`. Motif : une séance importée de Strava (US-02) n'est pas nécessairement rattachée à la séance prévue, et une séance saisie hors plan (AC3 de l'US-02) ne l'est jamais. Un test trop étroit créerait un `not_done` à côté d'un `done` importé le même jour — un doublon de sens, invisible dans les charges (0 unité) mais toxique pour le taux d'observance de l'AC6.

---

## Amendement du 2026-08-12 — le `not_done` automatique devient visible et acquittable

> Contexte de l'amendement : `11-design-notes.md` §3 conçoit la carte `D-notdone-notice` (Dashboard) qui **dit à l'utilisateur ce que le coach a compté** et lui laisse deux issues — « Je l'ai faite quand même » (correction, `PATCH /session-logs/:id`, déjà existant) et « C'est exact » (acquittement, sans modification de la donnée). Son §8 renvoie deux besoins non couverts : **discriminer** un `not_done` automatique d'un `not_done` déclaré, et **acquitter** sans re-déclarer. Ce sont les deux seuls objets de cet amendement ; §1 à §7 sont inchangés.

### 8. Le discriminant « automatique vs déclaré » est le **lien de retour existant**, pas une colonne nouvelle

`D-notdone-notice` ne doit jamais s'afficher pour un `not_done` que l'utilisateur a lui-même saisi sur l'écran Séance du jour (`MqvfH`, réponse « Non » à « Tu as fait la séance ? »). Cette distinction **existe déjà en base** et n'appelle aucune extension de `session_logs` :

```sql
-- « Ce session_log not_done a-t-il été créé par la clôture d'imprévu ? »
exists (select 1 from schedule_incidents i where i.resulting_session_log_id = l.id)
```

Trois propriétés déjà acquises rendent ce prédicat exact, et non approximatif :

1. **Il n'est renseigné que dans l'issue qui crée un log.** La contrainte `schedule_incidents_log_requires_outcome` (§11.2 de `docs/db-schema.md`) impose `resulting_session_log_id is null or closeout_outcome = 'log_created'` : le lien *est* le marqueur d'automaticité, garanti par le schéma et non par une convention de code.
2. **Il ne pointe jamais un log de l'utilisateur.** Par §3, l'issue `log_created` n'est atteinte que s'il n'existe **aucun** log non exclu à la date de clôture ; le job ne peut donc lier que le log qu'il vient lui-même d'insérer. L'issue `already_logged` — celle qui rencontre une saisie utilisateur — n'écrit rien du tout.
3. **Il est stable.** `session_logs` n'a aucune policy `DELETE` (ADR-004 §1 : le réalisé ne se supprime pas) ; le `on delete set null` de la FK n'est exercé que par la cascade d'effacement de compte (ADR-010 §8), qui emporte l'incident avec lui.

Deux ajouts de schéma, minimes, rendent ce prédicat **bien défini et indexé** — et ce sont les seuls :

```sql
-- Un session_log est le produit de clôture d'AU PLUS un imprévu : l'automaticité n'est jamais ambiguë.
create unique index schedule_incidents_resulting_log
  on schedule_incidents (resulting_session_log_id) where resulting_session_log_id is not null;

-- Sert la lecture de D-notdone-notice (§9) en un seul parcours.
create index schedule_incidents_notdone_notice
  on schedule_incidents (user_id, closed_out_at desc)
  where closeout_outcome = 'log_created' and acknowledged_at is null;
```

**Aucune colonne n'est ajoutée à `session_logs`, une fois de plus.** Ce n'est pas une coquetterie : y ajouter un `origin`/`created_by` obligerait à le retirer explicitement des deux listes blanches de GRANT colonne d'ADR-015 §4 (`INSERT` **et** `UPDATE`), donc à ouvrir une nouvelle surface de privilège sur une table de santé pour une information que la base porte déjà. Le coût de la duplication serait supérieur à celui de la jointure.

### 9. L'acquittement est porté par `schedule_incidents.acknowledged_at`, écrit par l'utilisateur, sur le patron de `plan_diffs`

```sql
alter table schedule_incidents
  add column acknowledged_at timestamptz,
  add constraint schedule_incidents_ack_requires_created_log
    check (acknowledged_at is null or closeout_outcome = 'log_created');

create policy "schedule_incidents_ack_own" on schedule_incidents for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke update on schedule_incidents from authenticated;
grant update (acknowledged_at) on schedule_incidents to authenticated;
```

**Pourquoi `schedule_incidents` et non `session_logs`** — quatre raisons, dans cet ordre :

1. **Ce qui est acquitté n'est pas le fait, c'est la déduction.** `session_logs` dit ce qui s'est passé ; « C'est exact » répond à *« j'ai compté cette séance comme non réalisée »*, qui est un verdict de clôture F3. Poser le marqueur sur le réalisé ferait de l'acquittement une seconde déclaration de l'utilisateur sur sa propre séance — exactement ce que le design refuse (« pas de re-déclaration, juste noté »).
2. **Un acquittement n'est pas une écriture de donnée de santé.** La policy `UPDATE` de `session_logs` est conditionnée à `has_active_consent(…, 'health_data_processing')` (ADR-010 §2, ADR-012 §2). Acquitter depuis `session_logs` ferait dépendre un simple « noté » d'un consentement au traitement de données de santé : une erreur de catégorie, doublée d'un `403` inexplicable pour l'utilisateur. Sur `schedule_incidents`, la question ne se pose pas.
3. **La granularité est celle de l'objet affiché.** La carte porte un imprévu clos (design §3.1, avec son « + 1 autre séance concernée ») ; un imprévu produit au plus un log (§8) : l'acquittement par incident est la granularité la plus fine possible, et c'est celle de l'UI.
4. **La promesse de §4 tient encore.** Zéro colonne ajoutée à `session_logs`, donc zéro impact sur les GRANT colonne d'ADR-015 §4 et sur le test d'inventaire T13/T19.

**Pourquoi `authenticated` écrit cette colonne directement, alors que `resolution` et `closeout_outcome` lui restent fermés.** C'est précisément la distinction posée par ADR-012 §3 : `UPDATE` n'est jamais accordé par défaut, il est accordé **au niveau colonne dès que seule une partie de la ligne est légitimement modifiable par l'utilisateur**. `resolution` est le verdict de l'algorithme de placement, `closeout_outcome` / `closed_out_at` / `resulting_session_log_id` sont ceux du job de clôture : aucun GRANT ne les couvre, une tentative d'écriture échoue en `permission denied for column`, et le commentaire « l'utilisateur SIGNALE, il ne FABRIQUE pas un imprévu résolu » reste littéralement vrai. `acknowledged_at`, lui, est un **geste utilisateur** au même titre que `plan_diffs.acknowledged_at` et `notifications.read_at`, déjà traités ainsi. Le patron est repris à l'identique, jusqu'à la route nominale (`POST /schedule/incidents/:id/acknowledge`, pendant exact de `POST /plan/reviews/:diffId/acknowledge`) : la route porte l'horodatage serveur et le contrôle métier, le GRANT colonne porte la garantie de dernier recours si un jour un client écrit en direct par PostgREST.

La contrainte `schedule_incidents_ack_requires_created_log` ferme le seul détournement possible du privilège : acquitter un imprévu qui n'a produit aucun log (`already_logged`, `skipped_no_consent`, `skipped_session_absent`) n'a pas de sens et est refusé par la base, pas seulement par la route.

**Ce que l'acquittement ne fait pas, et c'est le point central** : il **n'écrit rien dans `session_logs`**. Le `not_done` reste tel quel, reste compté dans `buildPlanningContext().history`, dans la révision hebdomadaire (AC5) et dans `evaluateStagnation()` (AC6). « C'est exact » range la carte, pas la donnée. Symétriquement, **corriger** la séance (`PATCH /session-logs/:id`, `completion` passant à `done`/`partial`) fait disparaître la carte **sans aucune écriture supplémentaire**, parce que la lecture joint sur `session_logs.completion = 'not_done'` : il n'existe aucun état à resynchroniser entre les deux tables.

---

## Conséquences

**Positives**

- L'issue réelle d'un imprévu redevient visible de la révision hebdomadaire et de la détection de stagnation, comme le fondateur l'a demandé, sans qu'aucune décision d'entraînement ne soit prise par la F3.
- Le consentement santé est respecté sur un chemin `service_role`, c'est-à-dire là où RLS ne protège plus — même leçon qu'ADR-013 §5, appliquée avant qu'un incident ne la rappelle.
- La clôture est auditable ligne à ligne (`closeout_outcome`, `resulting_session_log_id`), donc contestable et réparable.
- Aucune colonne ajoutée à `session_logs` : la F3 n'a aucune empreinte sur les tables des features précédentes. **L'amendement §8/§9 préserve cette propriété.**
- **La question ouverte n°1 est close** : le `not_done` automatique est désormais dicible (§8), montrable (`D-notdone-notice`), corrigeable (`PATCH /session-logs/:id`, inchangé) et acquittable (§9), sans qu'aucune de ces quatre capacités n'ait exigé une nouvelle table.
- **La correction et l'acquittement ne peuvent pas diverger** : l'un est un état de `session_logs`, l'autre un état de `schedule_incidents`, et la lecture les conjugue — aucune synchronisation applicative à maintenir.

**Négatives / à surveiller**

- **Un `not_done` peut être écrit alors que l'utilisateur s'est entraîné sans rien déclarer ni synchroniser.** C'est le prix de la décision produit. Atténuations : la fenêtre de grâce, le test large du §7, et la possibilité pour l'utilisateur de corriger — `PATCH /session-logs/:id` reste ouvert sur ses propres lignes (GRANT colonne de `0007`, `completion` incluse). ~~**À vérifier avec `designer`** : rien n'affiche aujourd'hui « j'ai considéré cette séance comme non réalisée », donc rien n'invite à corriger.~~ **Traité (2026-08-12)** : `11-design-notes.md` §3 (`D-notdone-notice` + état (d) du planning) et §8/§9 ci-dessus.
- **La carte a une fenêtre de 48 h** (design §3.1) : un utilisateur absent trois jours ne la verra jamais pour l'imprévu concerné. L'acquittement n'y change rien, la correction non plus — c'est l'état (d) « Non réalisée » du Planning semaine (design §3.4), non borné dans le temps, qui reste le chemin durable. À surveiller si le taux de correction s'avère faible.
- **`acknowledged_at` est réversible** (l'utilisateur peut le remettre à `null` via le GRANT colonne) : la carte réapparaîtrait. Sans conséquence — la valeur ne pilote qu'un affichage et n'entre dans aucun calcul.
- **Un signalement massif produit un `not_done` par séance**, ce qui accélère mécaniquement le diagnostic d'inobservance. C'est cohérent (`no_hardening_on_nonadherence` empêche déjà un durcissement en réponse), mais la fréquence de signalement n'a **aucune limite produit tranchée** (question ouverte de la fiche §7). Voir question ouverte n°2.
- **Le job dépend du cron horaire**, donc du plan Vercel Pro déjà requis par ADR-011 (§12, question 6 — budget non validé). Un retard de clôture est sans gravité : le job est idempotent et rattrape les imprévus ouverts des jours précédents.
- Un utilisateur qui change de fuseau entre le signalement et la clôture peut voir une clôture décalée d'un jour. Comportement identique à celui du rituel hebdomadaire, non traité spécifiquement.

---

## Alternatives écartées

| Alternative | Raison du rejet |
|---|---|
| Créer le `not_done` **au moment du signalement** | Faux dans le cas nominal : la séance est replacée et sera réalisée. Le log dirait le contraire de ce que l'écran affiche. |
| Créer le `not_done` **à minuit** de la date de destination | Aucune grâce : les séances du soir loguées à 21 h 30, et surtout les imports Strava tardifs, produiraient des faux positifs. |
| Créer le `not_done` **paresseusement**, à la prochaine ouverture de l'application | L'utilisateur qui ne revient pas est précisément celui dont l'adhérence doit être mesurée. Et une écriture de santé déclenchée par une lecture est un effet de bord difficile à auditer. |
| Passer par `applyDailyLog()` | Déclencherait l'ajustement de charge synchrone, explicitement exclu par la décision du fondateur. |
| Étendre la clôture à **toutes** les séances non loguées | Décision produit majeure jamais prise ; durcirait le diagnostic d'inobservance pour tous les utilisateurs, y compris ceux qui n'ont jamais signalé d'imprévu. |
| Écrire quand même le log sans consentement santé actif | Écriture de données de santé sans base légale, sur le seul prétexte que `service_role` contourne RLS. Exactement l'angle mort fermé par ADR-013 §5. |
| Marquer le log avec une valeur `source = 'inferred'` | Nouvelle valeur d'enum pour un cas unique ; casse la lecture binaire de provenance d'ADR-015 §3 (`connected` + connexion active ⇒ synchronisé, sinon déclaré). |
| Ne rien écrire et lire les imprévus depuis `evaluateStagnation()` | Ferait entrer une table F3 dans le `PlanningContext`, donc dans le moteur — la F1 deviendrait dépendante de la F3, à l'inverse de la frontière posée. |
| **(§8)** Colonne `session_logs.origin` / `created_by_system` | Duplique une information déjà portée par `resulting_session_log_id`, et impose de retirer la colonne des **deux** listes blanches de GRANT d'ADR-015 §4 : nouvelle surface de privilège sur une table de santé, pour zéro information nouvelle. Rompt aussi la promesse de §4 et de `docs/db-schema.md` §11.7. |
| **(§8)** Déduire l'automaticité du texte de `not_done_reason` | `not_done_reason` est du **texte libre écrit par l'utilisateur** (GRANT `UPDATE` de `0007`) : il pourrait le réécrire, et un simple changement de formulation ou de langue casserait le discriminant. Un invariant ne se lit pas dans une chaîne de caractères. |
| **(§9)** `session_logs.acknowledged_at` | Ferait de l'acquittement une écriture de donnée de santé (donc soumise au consentement, §9 raison 2), ajouterait une colonne à `session_logs` (§4), et ne saurait pas distinguer l'acquittement d'un `not_done` automatique de celui d'un `not_done` déclaré — qui n'a aucun sens. |
| **(§9)** Acquittement en `service_role` seul, sans GRANT colonne | Cohérent, mais gratuitement plus strict que le précédent `plan_diffs`/`notifications` déjà en vigueur pour le même geste. Deux traitements différents pour « l'utilisateur dit : noté » compliqueraient le modèle de privilèges sans rien protéger de plus (la route serveur reste le chemin nominal dans les deux cas). |
| **(§9)** Table dédiée `notice_acknowledgements` | Une table pour une colonne. `plan_diffs` et `notifications` ont établi le patron inverse il y a deux features. |
| **(§9)** Faire de « C'est exact » un `PATCH /session-logs/:id` confirmant `completion = 'not_done'` | Transformerait un accusé de réception en **déclaration** de l'utilisateur sur sa propre séance, ce que le design refuse explicitement, et exigerait le consentement santé pour dire « noté ». |

---

## Questions ouvertes relayées

1. ~~**Aucun écran ne montre le `not_done` automatique, ni ne propose de le corriger.**~~ **Close le 2026-08-12** : `11-design-notes.md` §3 conçoit la carte `D-notdone-notice` (Dashboard, fenêtre 48 h) et l'état (d) « Non réalisée » du Planning semaine ; le présent amendement §8/§9 fournit le discriminant et le marqueur d'acquittement. Reste au périmètre de `spec-writer` d'inscrire ce parcours dans la fiche US-03 (§4) — il n'est aujourd'hui porté que par les notes de design.
2. **Fréquence / limite du signalement d'imprévu** — question ouverte de la fiche §7, **non tranchée ici**. Le support technique est prêt (`schedule_incidents` est un journal daté, `planning.incident_soft_limit_per_week` est déjà prévu au ruleset avec la valeur `null` = aucune limite appliquée). Deux options attendent une décision produit : plafond dur avec bouton `disabled` (état déjà spécifié par le design §1.7), ou signal remonté au coach comme indicateur d'inobservance en révision hebdomadaire. Propriétaire : fondateur.
3. **Règle de préséance entre états de carte du Planning semaine** — `11-design-notes.md` §3.4 pose (c) `ANNULÉE` > (d) `NON RÉALISÉE` > (b) `DÉPLACÉE`, et son §8 point 5 demande que le serveur ne remonte pas deux états concurrents. **Hors périmètre du présent amendement**, qui se limite au discriminant et à l'acquittement. Le matériau nécessaire existe (`session_placements.status` + le prédicat §8) ; l'arbitrage du contrat de `SessionPlacementView` reste à rendre. Propriétaire : `architect` (prochaine passe).
