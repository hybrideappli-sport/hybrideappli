# ADR-016 — Placement horaire dérivé, matérialisé hors du plan, et imprévu modélisé comme indisponibilité datée

- **Statut** : Accepté
- **Date** : 2026-08-12
- **Décideur** : `architect`
- **Portée** : Projet — modèle de données du *quand*
- **Dépend de** : ADR-004 (prévu / réalisé, chemin d'écriture unique), ADR-005 (versions append-only), ADR-007 (paramètres versionnés), ADR-012 (privilèges)
- **Feature déclenchante** : US-03, AC1 / AC2 / AC3 / AC4 — et question ouverte §7 « granularité de l'horaire précis », explicitement déléguée à `architect`

---

## Contexte

La frontière posée en F1 est nette (`08-architecture.md` §11, ADR-004 §5) : **F1 décide QUOI et COMBIEN, F3 décide QUAND**. `planned_sessions` porte `scheduled_date` + `slot ∈ {am, pm, unspecified}` et **aucune heure**. La fiche US-03 demande d'ajouter le placement horaire, la traçabilité d'un replacement et l'état « annulée pour la semaine ».

Cinq constats tirés du code et du schéma existants conditionnent la réponse.

1. **`planned_sessions` n'est pas écrivable hors du chemin de matérialisation.** ADR-004 §2 et `08-architecture.md` §3.2 posent que `materializePlanVersion()` est le **seul** écrivain de `plan_versions`, `plan_blocks`, `plan_weeks`, `planned_sessions`, `nutrition_days`, `decision_traces`, et qu'un test de cohérence rejoue `plan_versions.snapshot` et le compare à la projection. Écrire une heure dans `planned_sessions` à chaque imprévu ferait diverger la projection de son snapshot — snapshot qui est, lui, **immuable par trigger**. Le placement ne peut donc pas vivre dans la table du moteur.

2. **Un replacement ne doit pas produire une version de plan.** Le contenu ne bouge pas (AC3) ; créer une `plan_versions` déclencherait le diff hebdomadaire (ADR-005 §3), l'invariant d'asymétrie (§5) et le rendu d'explications LLM — toute la machinerie de l'AC5 de la F1 pour un changement qui n'est pas une décision d'entraînement. La fiche l'écrit d'ailleurs : le signalement d'imprévu « ne déclenche jamais lui-même d'ajustement de charge ».

3. **`planned_sessions` est rejetable.** Chaque régénération (révision hebdomadaire, signal négatif, protocole douleur : 2 à 5 par semaine, ADR-005) crée de nouvelles lignes. Tout ce qui serait rattaché durablement à un `planned_session_id` serait perdu au prochain signal négatif. Un imprévu signalé mardi doit survivre à une régénération de mercredi.

4. **`availability_slots` ne porte pas d'heures.** Les colonnes sont `weekday`, `slot`, `max_minutes`, `is_available` (`docs/db-schema.md` §2). L'onboarding F1 ne capte ni heure de début ni heure de fin, et la fiche exclut explicitement tout écran de gestion des disponibilités. **Il n'existe donc aucune donnée d'entrée permettant un placement à la minute près.**

5. **L'étape 9 du moteur ignore déjà `slot` et `max_minutes`.** `09-build-sessions.ts` ne lit que `weekday` sur les créneaux disponibles et écrit `slot: 'unspecified'` en dur. Le créneau macro et la capacité déclarés par l'utilisateur ne sont, à ce jour, consommés par personne.

---

## Décision

### 1. Le placement est une **projection dérivée**, matérialisée dans une table qui lui est propre

```
placement = f( planned_sessions de la version active,
               availability_slots,
               schedule_incidents,
               ruleset.params.planning )
```

`f` est **pure et déterministe** ; son résultat est écrit dans `session_placements`, table **append-only avec chaîne de supersession** (une seule ligne courante par `planned_session_id`, garantie par un index unique partiel `where superseded_at is null`).

Trois propriétés en découlent, et ce sont elles qui justifient la forme :

- **Aucune table du moteur n'est écrite par la F3.** `planned_sessions` reste intacte, l'invariant d'ADR-004 §2 est préservé mot pour mot, et le test de cohérence snapshot ↔ projection continue de passer sans être amendé.
- **Le placement est reconstructible.** Si `session_placements` était vidée, un recalcul reproduirait l'état courant à partir des trois entrées ci-dessus. La table est un cache **avec historique**, jamais une source de vérité isolée.
- **L'historique du déplacement est lisible sans table supplémentaire** : la ligne courante porte `origin_date` / `origin_time` (le « avant » du motif `ancien → nouveau` du design §1.5), et `previous_placement_id` chaîne l'audit.

**Pourquoi matérialiser plutôt que dériver à la lecture ?** Exactement l'argument d'ADR-005 §4 sur le diff : un placement recalculé à chaque affichage **dérive**. Le message annoncé en `aria-live` (« Séance déplacée à jeudi 7 h 00 ») et la carte relue dix minutes plus tard doivent dire la même chose, même si le ruleset a changé entre-temps. Matérialiser fige ce qui a été montré ; c'est aussi ce qui rend la clôture d'imprévu (ADR-017) auditable.

### 2. `materializeSessionPlacements()` est le chemin d'écriture unique

Sur le modèle de `materializePlanVersion()` (ADR-004) et de `finalizeSessionLogLoad()` (ADR-015 §1), une fonction serveur unique écrit `session_placements`. Elle est appelée depuis **exactement quatre** points :

| Appelant | Déclencheur | Motif écrit |
|---|---|---|
| `regeneratePlan()` (dans la même transaction, après `materializePlanVersion`) | toute régénération de plan | `initial` (première version) / `plan_regenerated` |
| `resolveScheduleIncident()` | `POST /schedule/incidents` | `incident_reported` ou `no_slot_available` |
| job `refresh_placements` | modification de `availability_slots` (AC2) | `availability_changed` |
| job `schedule_closeout` | clôture (ADR-017) | — (lecture seule sur les placements) |

Aucun autre chemin. La règle est vérifiable par `grep`, comme celle d'ADR-004.

### 3. L'imprévu est une **indisponibilité datée**, pas un attribut de séance

C'est le point qui rend le modèle robuste à la régénération (constat 3).

> Un imprévu n'est pas « cette séance est déplacée ». C'est **« ce créneau-là, ce jour-là, n'est plus disponible »** — c'est-à-dire une exception ponctuelle à la disponibilité récurrente déclarée en F1.

`schedule_incidents` journalise donc `(user_id, reported_for_date, blocked_slot, blocked_from, blocked_to)` : un fait **utilisateur**, daté, append-only, de la même famille que `availability_slots` et `session_logs` — pas un artefact de plan. Il survit à toutes les régénérations, et le placement recalculé après une régénération continue d'éviter le créneau signalé **sans qu'aucune logique de rattachement de séance ne soit nécessaire**.

La séance concernée (`planned_session_id`) et le placement invalidé (`invalidated_placement_id`) sont conservés à titre **informatif et d'idempotence** : l'index unique sur `invalidated_placement_id` fait office de garde-fou anti double-clic, sans quoi deux appuis rapides bloqueraient deux créneaux.

**Largeur de la fenêtre bloquée.** Bloquer tout le créneau macro (`pm` entier) viderait de son sens la première branche de l'AC3 (« un autre horaire disponible le même jour ») ; ne bloquer que les 52 minutes de la séance produirait un replacement à 19 h 30 pour un utilisateur retenu toute la soirée. Retenu : **la fenêtre occupée, élargie de `planning.incident_block_margin_min` (défaut 120 min) de part et d'autre**. Un replacement le même jour reste possible (matin, ou fin de soirée), un replacement « 30 minutes plus tard » est exclu.

### 4. Granularité : **sous-créneaux fixes sur une grille de 30 minutes**, bornes issues du ruleset

C'est la réponse à la question ouverte §7 de la fiche, explicitement déléguée à `architect`.

```jsonc
"planning": {
  "slot_windows": { "am":  { "start": "06:30", "end": "11:30" },
                    "pm":  { "start": "16:30", "end": "21:30" },
                    "unspecified": { "start": "06:30", "end": "21:30" } },
  "grid_minutes": 30,
  "preferred_start_times": { "am": ["07:00","06:30","08:00","09:00"],
                             "pm": ["18:30","19:00","17:30","20:00"],
                             "unspecified": ["18:30","07:00","12:30"] }
}
```

- **Ni le minute-près, ni le choix libre de l'utilisateur.** Le minute-près serait une **fausse précision** : aucune donnée d'entrée ne le fonde (constat 4), et afficher « 18 h 07 » suggérerait une connaissance de l'emploi du temps que nous n'avons pas. Le choix libre supposerait un écran de sélection d'horaire, explicitement hors périmètre (fiche §4).
- **Le stockage reste permissif** : `session_placements.scheduled_time` est un `time` standard, à la minute. Passer un jour à une grille de 15 minutes, ou ouvrir le choix libre, sera un changement de paramètre ou d'écran — **jamais une migration**.
- `preferred_start_times` existe pour que l'heure produite soit **lisible et stable** (07 h 00 plutôt que 06 h 30 systématique) sans qu'aucune logique ne soit codée en dur : c'est une préférence ordonnée, pas une règle.

### 5. L'algorithme de placement est une fonction pure du moteur, **hors du pipeline**

`placeWeekSessions()` vit dans `@hybride/rules-engine`, mais **n'appartient pas** aux 12 étapes de `generatePlan()` et n'est appelée par aucune d'elles — exactement le statut de `computeHybridScore()` (ADR-014 §6).

Elle y vit tout de même, et pas dans `apps/web`, pour **une seule raison** : elle doit vérifier des garde-fous de sécurité déjà implémentés (`isIntenseSessionType`, espacement d'interférence AC10, jours consécutifs sans repos AC8, `guardrail-helpers.ts`). Les réimplémenter côté application dupliquerait de la logique de sécurité — la faute que toute l'architecture F1 cherche à rendre impossible.

**Le contrat de sortie ne porte aucun champ de contenu :**

```ts
type PlacementDecision = {
  sessionId: string;
  status: 'scheduled' | 'moved' | 'cancelled_week';
  date: string | null;          // null ⟺ cancelled_week
  startTime: string | null;     // 'HH:MM'
  originDate: string;           // intention du moteur — le « avant » du design §1.5
  originTime: string | null;
  reason: PlacementReason;
  incidentId: string | null;
  guardrailsChecked: string[];  // ids de règles évaluées
};
```

Aucune durée, aucune charge, aucun type de séance, aucune prescription. **L'AC3 (« le contenu de la séance reste strictement inchangé ») devient une propriété de type**, vérifiée par le compilateur, et non une vigilance de relecture.

### 6. Le placement ne produit pas de `decision_traces`

Les traces de l'ADR-006 et l'assertion terminale `assertEveryNumberIsTraced` (étape 12) couvrent les **valeurs de charge et de volume** — ce que la fiche F1 exige de justifier. Un horaire n'en est pas une : le « pourquoi » exigé par l'AC3 est énumérable (`initial`, `plan_regenerated`, `availability_changed`, `incident_reported`, `no_slot_available`), rendu par template, sans LLM ni trace.

`guardrails_checked` conserve néanmoins la liste des règles évaluées lors du placement : de quoi répondre à « pourquoi pas jeudi 7 h ? » en exploitation, sans faire entrer le placement dans le régime d'auditabilité du moteur.

### 7. Le recalcul sur imprévu est **local**, jamais une réoptimisation de la semaine

Seules sont replacées les séances dont le placement courant est invalidé par l'imprévu. Les autres sont **gelées** et n'entrent dans le calcul que comme occupation. Motifs : le design ne montre qu'une carte qui bouge (§1.5, « aucune carte fantôme »), et une semaine qui se réorganise entièrement à chaque signalement serait illisible — l'utilisateur perdrait la confiance dans un planning dont il vient précisément de déléguer l'arbitrage.

Sont également gelées : toute séance dont le placement est **passé** (`date < now`), et tout créneau à moins de `planning.min_lead_time_min` (défaut 60 min) de l'instant courant — on ne replace pas une séance dans dix minutes.

### 8. Ce que le placement peut changer, et ce qu'il ne peut pas

| Peut | Ne peut pas |
|---|---|
| Choisir l'heure dans un créneau déclaré disponible | Toucher `session_type`, `duration_min`, `load_units`, `intensity_zone`, `prescription`, `muscle_groups` |
| Changer la **date effective** à l'intérieur de la semaine ISO (AC2 : « seuls la date effective et l'horaire sont du ressort de cette feature ») | Déplacer une séance **hors** de sa semaine ISO — `planning.reschedule_scope = 'current_week'`, corollaire direct du refus de report cumulatif (AC4) |
| Annuler pour la semaine, faute de créneau (AC4) | Supprimer la ligne `planned_sessions` correspondante |
| Poser deux séances le même jour, sous conditions (`max_sessions_per_day`, `min_minutes_between_sessions_same_day`, `allow_two_intense_sessions_same_day = false`) | Créer un enchaînement que le moteur n'aurait pas produit : garde-fous AC8/AC10 revérifiés à chaque candidat |

---

## Conséquences

**Positives**

- La F3 n'écrit dans **aucune** table de la F1 ni de la F2. Aucune colonne ajoutée à `planned_sessions`, aucune à `session_logs`. Le point de contact §13.8 n°5 laissé par l'US-02 est consommé sans dette.
- Un imprévu survit à une régénération de plan sans mécanisme de ré-appariement de séance — la fragilité principale de ce type de feature est éliminée par le modèle, pas par du code défensif.
- L'AC2 (« si Thomas modifie ses disponibilités, le placement se recalcule **sans redemander une décision au moteur** ») est structurellement vraie : le placement ne passe jamais par `generatePlan()`.
- La granularité horaire est un paramètre, pas un schéma : la question ouverte de la fiche est tranchée sans être verrouillée.
- L'écart *prévu / réel* devient mesurable sans nouvelle colonne : `session_placements.scheduled_time` (F3) face à `session_logs.started_at` (F2, ADR-015). C'est la réponse au point §13.8 n°1.

**Négatives / à surveiller**

- **Une table de plus à recalculer à chaque régénération.** Volume comparable à `planned_sessions` (≈ 10-14 lignes × 2 à 5 régénérations par semaine). La chaîne de supersession la fait croître plus vite que `planned_sessions` : prévoir la même politique de rétention qu'ADR-004 (« conservation intégrale 12 mois, puis compaction »).
- **Une annulation (AC4) n'est terminale que dans sa version de plan.** Si le moteur régénère la semaine, le placement est recalculé de zéro et la séance peut réapparaître si la charge a baissé et qu'un créneau se libère. Ce n'est **pas** un report cumulatif (refusé par AC4) : c'est la reprojection depuis la situation réelle du jour, principe posé par l'AC4 de la F1 et ADR-004 §1. À l'intérieur d'une même version, en revanche, l'annulation est définitive et le bouton disparaît (design §1.6).
- **Le placement peut échouer là où le moteur avait réussi.** `09-build-sessions.ts` ne regarde que `weekday` : il peut poser une séance de 90 min sur un jour dont le seul créneau disponible en porte 45. Le cas est nominal (AC1 renvoie explicitement au traitement explicite de l'AC4) mais il produira des annulations que l'utilisateur pourra juger arbitraires. **Piste de correction, hors périmètre US-03** : faire consommer `slot` et `max_minutes` par l'étape 9 du moteur. À ne pas faire dans cette feature — ce serait rouvrir une décision de contenu.
- `session_placements` n'a **pas** de trigger `forbid_mutation()` : `superseded_at` doit pouvoir être écrit. Un trigger dédié restreint l'`UPDATE` aux seules colonnes de supersession ; le `DELETE` reste ouvert pour ne pas bloquer les cascades de `erase_account()`.

---

## Alternatives écartées

| Alternative | Raison du rejet |
|---|---|
| Ajouter `scheduled_time` à `planned_sessions` | Casse le chemin d'écriture unique d'ADR-004 §2, fait diverger la projection de `plan_versions.snapshot` (immuable), et perd le placement à chaque régénération. |
| Créer une `plan_versions` à chaque replacement | Déclenche diff, invariant d'asymétrie et rendu LLM pour un changement qui n'est pas une décision d'entraînement. Contredit la décision du fondateur (« événement temporel, jamais un ajustement de charge »). |
| Dériver le placement à la lecture, sans table | Le placement affiché dériverait dans le temps (même argument qu'ADR-005 §4 contre le diff à la volée), et la clôture d'imprévu (ADR-017) n'aurait plus d'artefact stable à interroger. |
| Rattacher l'imprévu à la séance (`planned_sessions.moved_reason`) | Perdu à la première régénération de plan, c'est-à-dire potentiellement le lendemain. |
| Modéliser l'imprévu comme une ligne `availability_slots` datée | `availability_slots` est **récurrent** (`weekday`), déclaratif, et **écrivable par le client** (policy `for all`). Y écrire un événement résolu par le serveur mélangerait deux régimes de confiance et laisserait l'utilisateur fabriquer ses propres imprévus résolus. |
| Placement à la minute près | Fausse précision : `availability_slots` ne porte aucune heure ; rien ne fonderait « 18 h 07 ». |
| Choix libre de l'horaire par l'utilisateur | Suppose un écran de sélection, hors périmètre (fiche §4), et déplace la charge mentale que la feature doit précisément retirer (fiche §1). |
| Algorithme de placement dans `apps/web` | Dupliquerait les garde-fous AC8/AC10 hors du moteur — exactement ce qu'ADR-002/ADR-003 rendent impossible pour la charge. |
| Placement comme 13ᵉ étape du pipeline `generatePlan()` | Ferait du *quand* une sortie du moteur de contenu, effacerait la frontière F1/F3 et lierait chaque replacement à une version de plan. |
| Réoptimisation globale de la semaine à chaque imprévu | Illisible pour l'utilisateur ; toutes les cartes bougeraient pour un seul empêchement. |

---

## Questions ouvertes relayées

1. **`planning.max_sessions_per_day`, `min_minutes_between_sessions_same_day` et `allow_two_intense_sessions_same_day` sont des valeurs proposées, non validées** (`to_validate` dans `source_refs`, comme les garde-fous d'ADR-007 §« mise à jour 2026-08-06 »). Elles touchent à la sécurité (densité d'entraînement sur une journée) sans être exigées par un AC. À faire confirmer avec les 6 paramètres `guardrails` avant la publication du ruleset `1.0.0`.
2. **Le moteur ignore `slot` et `max_minutes`** (constat 5). Tant que c'est le cas, la F3 rattrape en aval une contrainte qui aurait pu être respectée en amont. À arbitrer pour une itération ultérieure, avec `spec-writer` : c'est une décision de contenu, donc F1.
