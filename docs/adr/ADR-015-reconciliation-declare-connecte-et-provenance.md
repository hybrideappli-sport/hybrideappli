# ADR-015 — Réconciliation déclaré / connecté : charge réalisée, provenance immuable, exclusion plutôt que suppression

- **Statut** : Accepté
- **Date** : 2026-08-12
- **Décideur** : `architect`
- **Portée** : Projet — modèle de données du réalisé
- **Dépend de** : ADR-004 (prévu / réalisé), ADR-012 (privilèges), ADR-013 (import Strava), ADR-014 (score hybride)
- **Feature déclenchante** : US-02, AC3 / AC5 / AC6 / AC10 — question ouverte §7 « règle de priorité exacte », déléguée à `architect`

---

## Contexte

L'AC5 exige qu'une même séance réelle, saisie manuellement **et** synchronisée depuis Strava, n'apparaisse jamais deux fois, et « jamais une duplication silencieuse dans les agrégats de charge ou dans le score hybride ». La fiche laisse la règle exacte ouverte : *la donnée connectée écrase-t-elle la donnée déclarée, ou l'utilisateur arbitre-t-il ?*

Trois constats tirés du code existant conditionnent la réponse :

1. **`session_logs` ne porte aucune charge.** La colonne `load_units` n'existe que sur le *prévu* (`planned_sessions`, `plan_weeks`). Le commentaire de `build-planning-context.ts` (lignes 180-184) l'assume explicitement : `actualLoadUnits` est laissé à `null`, « leur calcul est un travail dédié ». **Le score hybride n'a donc, aujourd'hui, aucune matière première.**
2. **`CreateSessionLogInputSchema` ne porte ni discipline, ni type de séance, ni heure de début.** Une saisie est un compte rendu du *plan du jour* (`plannedSessionId`), pas l'enregistrement d'une séance quelconque. La colonne `session_logs.sport_id` existe mais **n'est jamais écrite**. L'AC3 (« Thomas n'est jamais bloqué faute d'intégration pour son sport ») n'est donc pas réellement couverte par l'écran existant.
3. **`session_logs` est protégée en `UPDATE` colonne par colonne (ADR-012 §3), mais son `INSERT` est accordé table entière.** Un client peut aujourd'hui insérer une ligne avec `source = 'connected'`. Le sujet était théorique en F1 (aucun code ne lisait `source`) ; il cesse de l'être dès que `load_units` conditionne le score **et** que la charge réalisée alimente le moteur.

---

## Décision

### 1. La charge réalisée est une colonne, écrite par un chemin unique

`session_logs` porte `load_units int` — la charge **réalisée**, dans la même unité inter-disciplines que le prévu (ADR-004 §4), calculée par `computeLoadUnits()` :

| Cas | Durée retenue | Type de séance retenu | Discipline retenue |
|---|---|---|---|
| Log rattaché à une séance prévue | `actual_duration_min`, à défaut la durée prévue | celui de la séance prévue | celle de la séance prévue |
| Log libre (séance hors plan, AC3) | `actual_duration_min` (obligatoire dans ce cas) | fourni par la saisie | fournie par la saisie |
| Log importé (AC4) | `moving_time` de l'activité | celui de la séance prévue si le log est rattaché, sinon la valeur par défaut de `external_sport_mappings` | résolue par `external_sport_mappings` |
| `completion = 'partial'` | — | — | charge multipliée par `actual_duration_min / durée prévue`, borné à 1 |
| `completion = 'not_done'` | — | — | `load_units = 0` |

Hériter le type de séance du plan quand le log lui est rattaché n'est pas une commodité : c'est la seule source d'intensité dont nous disposions pour une activité importée, puisqu'ADR-013 §4 exclut l'import de la fréquence cardiaque. Le plan sait ce que la séance devait être ; l'import sait combien de temps elle a duré.

`load_units` **n'est jamais fournie par le client**, ni à l'`INSERT` ni à l'`UPDATE`, et n'est écrite que par `finalizeSessionLogLoad()` — chemin d'écriture unique, sur le modèle de `materializePlanVersion()` (ADR-004). Une charge réalisée déclarée par le client serait un levier direct sur les décisions de volume du moteur.

### 2. Priorité de réconciliation : le mesuré prime sur le déclaré, le ressenti n'est jamais perdu

**Règle retenue, proposée comme défaut raisonnable et documentée comme telle** (la fiche ne la tranche pas) :

> Quand une donnée connectée et une donnée déclarée décrivent le même événement réel, **la ligne connectée est retenue** comme ligne portante. La ligne déclarée est **conservée**, marquée comme exclue des agrégats, et **enrichit** la ligne retenue de tout ce que la source tierce ne sait pas produire.

Champs transférés de la ligne déclarée vers la ligne retenue, s'ils sont absents de celle-ci : `rpe`, `freshness`, `pain`, `pain_zone`, `pain_at_rest`, `comment`, `not_done_reason`.

Deux justifications :

- **Sur les grandeurs mesurées** (durée, distance, heure de début), un capteur bat une estimation de mémoire. C'est le sens même de l'AC4 (« sans ressaisie »).
- **Sur les grandeurs ressenties** (RPE, fraîcheur, douleur), la source tierce n'a rien à dire — et ces champs pilotent le protocole douleur (AC9) et l'asymétrie de charge (AC4) de la F1. Les laisser tomber au motif que la ligne connectée « gagne » supprimerait un signal de sécurité. **Un signal de douleur n'est jamais écrasé, dans aucun sens de fusion.**

La fusion est **réversible** : `POST /api/v1/session-logs/:id/unmerge` rétablit les deux lignes. C'est la réponse à la seconde branche de la question ouverte (« ou l'utilisateur est-il sollicité pour arbitrer ? ») : plutôt que d'interrompre l'utilisateur à chaque import pour un arbitrage qu'il n'a pas demandé, on résout automatiquement, on l'affiche, et on lui laisse le dernier mot. La fusion est de toute façon tracée (`match_evidence`), donc contestable.

**Critères d'appariement** (fonction pure, testable, `lib/data/reconcile-session-logs.ts`) :

1. même utilisateur, et aucune des deux lignes déjà exclue ;
2. **recouvrement temporel** : `|started_at(A) − started_at(B)| ≤ match_window_min` (défaut 90 min). Si l'une des deux lignes n'a pas d'heure de début — cas courant d'une saisie qui ne renseigne qu'une date — on retombe sur `logged_date` identique dans le fuseau de l'utilisateur ;
3. **compatibilité de discipline** : même `sport_id`, ou même `sports.family` quand l'un des deux `sport_id` est nul ;
4. en cas de candidats multiples : le plus proche dans le temps ; à égalité stricte, le plus ancien `created_at`. La règle appliquée et son niveau de confiance sont écrits dans `match_evidence` — jamais un choix arbitraire non tracé.

La règle s'applique **dans les deux sens chronologiques** : un import qui rencontre une saisie existante fusionne, et une saisie postérieure à un import fusionne aussi, dans la même transaction que le `POST /session-logs` — l'utilisateur voit immédiatement « j'ai reconnu ta sortie de ce matin, j'y ai ajouté ton ressenti » plutôt qu'un doublon qui disparaîtra plus tard.

### 3. Exclusion plutôt que suppression, provenance immuable

**Le réalisé ne se supprime pas** (ADR-004 §1). Une ligne « perdante » n'est donc ni effacée, ni écrasée : elle porte `excluded_at`, `exclusion_reason` et `superseded_by_log_id`. Tous les agrégats (score hybride, Dashboard, `PlanningContext.history`) filtrent sur `excluded_at is null` — **un seul prédicat, un seul index partiel**, ce qui rend la double comptabilisation difficile à réintroduire par inadvertance.

Trois motifs d'exclusion : `merged_duplicate` (AC5), `deleted_at_source` (l'utilisateur a supprimé l'activité sur Strava), `user_excluded` (arbitrage manuel).

**`session_logs.source` reste immuable.** L'AC10 demande que les données d'une source déconnectée soient « recatégorisées comme un historique déclaratif ». Réécrire `source = 'declared'` sur des lignes qui *sont* entrées par un import falsifierait le journal d'acquisition — un principe que la F1 défend partout ailleurs (registre de consentement, traces, versions de plan). La demande produit est satisfaite autrement, sans mentir au schéma :

```
provenance affichée = 'synced'   si source = 'connected' ET connexion associée active
                    = 'declared' sinon
```

Résultat visible identique à la demande (glyphe `✎` après déconnexion, design §2.6), reconnexion sans migration de données, et audit intact : on sait toujours *comment* une donnée est entrée. La différence entre « comment c'est entré » et « d'où ça vient aujourd'hui » est explicitée dans le contrat d'API, pas laissée à l'interprétation de chaque écran.

### 4. `INSERT` est restreint colonne par colonne, comme `UPDATE`

ADR-012 §3 a écarté l'idée de retirer `INSERT` du GRANT par défaut, au motif que « RLS couvre intégralement ce verbe ». L'argument est exact pour *quelles lignes* — et faux pour *quelles colonnes*, exactement comme pour `UPDATE` : une policy `with check` ne sait pas dire « cette colonne n'est pas à toi ».

Le sujet était sans conséquence tant qu'aucune colonne de `session_logs` n'était décidée par le serveur. Il cesse de l'être avec `load_units` (levier de charge) et `source` / `data_connection_id` / `external_activity_id` (provenance). D'où l'amendement :

```sql
revoke insert on session_logs from authenticated;
grant insert (user_id, planned_session_id, logged_date, sport_id, session_type, started_at,
              completion, not_done_reason, actual_duration_min, rpe, freshness,
              pain, pain_zone, pain_at_rest, comment)
  on session_logs to authenticated;
```

Même traitement pour `body_metrics`. **Règle générale, à appliquer désormais à toute table** : dès qu'une colonne est décidée par le serveur, le GRANT `INSERT` est énuméré colonne par colonne, au même titre que `UPDATE`. Les colonnes non accordées gardent leur valeur par défaut (`source = 'declared'`, `load_units = null`), donc rien ne casse côté client ; une tentative d'écriture échoue en `permission denied for column` — l'échec bruyant recherché par ADR-012.

### 5. Extension minimale de la saisie manuelle (AC3)

`CreateSessionLogInput` gagne quatre champs facultatifs : `sportCode`, `sessionType`, `startedAt`, et rend `actualDurationMin` obligatoire quand `plannedSessionId` est nul et `completion ≠ 'not_done'` (sans durée, aucune charge réalisée n'est calculable).

C'est le strict nécessaire pour que l'écran Séance du jour couvre une séance **hors plan** — musculation faite spontanément, sortie non prévue. La réponse à la vérification demandée par la fiche §6 est donc : **non, l'écran existant ne couvre pas déjà le besoin de l'AC3** ; il faut un point d'entrée « enregistrer une séance non prévue », qui n'est maquetté nulle part (retour vers `designer`).

Côté **nutrition**, en revanche, aucune extension : la F1 limite volontairement la saisie à `adherence` + `energy` (AC11, carnet alimentaire exclu), et la fiche US-02 reconduit cette exclusion. Le bouton « Saisir manuellement » de la carte Nutrition route vers le check-in existant, comme le design l'a déjà écrit (« Tes 2 signaux nutrition suffisent »).

---

## Conséquences

**Positives**

- Le score hybride et les agrégats du Dashboard reposent sur une charge réalisée réelle, et non sur une charge prévue supposée respectée.
- La double comptabilisation interdite par l'AC5 devient une propriété du schéma (un prédicat unique), pas une vigilance de développeur.
- Un signal de douleur ne peut être perdu par aucune fusion, dans aucun sens.
- L'historique reste vrai : on sait toujours comment chaque donnée est entrée, même après déconnexion et reconnexion d'une source.
- La faille d'`INSERT` colonne est fermée avant qu'un chemin de code ne l'exploite.

**Négatives / à surveiller**

- **Toute nouvelle requête d'agrégat doit penser à `excluded_at is null`.** C'est le prix de la conservation. Mitigation : un test d'intégration dédié (une séance fusionnée ne doit apparaître dans aucun agrégat), et une vue `session_logs_counted` proposée comme point d'entrée par défaut des lectures d'agrégat.
- `build-planning-context.ts` doit désormais peupler `actualLoadUnits` (aujourd'hui `null` en dur). Aucune règle du moteur ne le lit à ce jour — le changement est donc **inerte à court terme**, mais il devient une entrée réelle du moteur dès qu'une règle s'en servira : à traiter comme un changement d'entrée moteur (tests de non-régression sur la génération de plan).
- La fenêtre d'appariement de 90 minutes produira des faux positifs sur un enchaînement type triathlon (natation puis vélo à 30 min d'écart). Le critère de discipline les évite dans la plupart des cas ; le reste est rattrapé par `unmerge`.
- Un utilisateur qui modifie une saisie déjà fusionnée modifie une ligne exclue. Comportement retenu : l'enrichissement de la ligne portante est **rejoué** à chaque `PATCH` d'une ligne exclue. À couvrir par un test.

---

## Alternatives écartées

| Alternative | Raison du rejet |
|---|---|
| Supprimer la ligne déclarée à la fusion | Contredit ADR-004 §1 (le réalisé ne se supprime pas) et perd le ressenti saisi par l'utilisateur — donc des signaux de sécurité. |
| La donnée déclarée gagne toujours | La saisie manuelle estime la durée de mémoire ; l'import la mesure. Et cela viderait l'AC4 de son sens : synchroniser n'apporterait rien à qui saisit déjà. |
| Demander à l'utilisateur d'arbitrer chaque doublon | Interruption à chaque import pour un arbitrage qu'il n'a pas demandé, et écran non maquetté. La résolution automatique **réversible** offre le même contrôle sans la friction. |
| Fusionner physiquement les deux lignes en une seule | Détruit l'information « deux enregistrements existaient », rend l'annulation impossible, et fait de `session_logs` une table mutable. |
| Table de résolution dédiée (`data_reconciliations`) | Une table de plus pour une relation 1-1 déjà exprimable par trois colonnes portées par la ligne perdante, qui devient ainsi auto-explicative. |
| Réécrire `source = 'declared'` à la déconnexion (lecture littérale de l'AC10) | Falsifie le journal d'acquisition, casse la reconnexion (aucun moyen de retrouver les lignes de la connexion) et contredit le principe d'auditabilité appliqué partout ailleurs. Le résultat visible attendu est obtenu par la règle de provenance §3. |
| Colonne booléenne `is_duplicate` | Ne dit ni pourquoi, ni au profit de quelle ligne, ni quand — donc pas auditable, et inextensible aux autres motifs d'exclusion. |
| Recalculer `load_units` à la volée à l'affichage | ADR-004 §4 l'a déjà écarté pour le prévu ; le faire pour le réalisé rendrait le score dépendant de la version courante des facteurs d'intensité, donc non reproductible. |
