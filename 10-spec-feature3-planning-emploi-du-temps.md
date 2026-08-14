# US-03 — Planning selon emploi du temps (Feature 3 du MVP)

> Fiche fonctionnelle SDD. Rédigée par `spec-writer`. Lecture seule pour tous les autres agents.
>
> Correspond à la **Feature 3** des 3 features retenues au MVP (`03-mvp.md`, `06-recap.md`) — numérotée `US-03` pour rester alignée sur la numérotation des features (F1 = US-01, F2 = US-02 « Centralisation des données », F3 = US-03).
>
> Branche cible : `feature/US-03-planning-emploi-du-temps`
> Statut : ⏳ Specify

---

## 1. Contexte

Thomas (persona principale, voir `02-persona.md`) a un poste à responsabilité et une vie personnelle à gérer. Il s'entraîne 5 à 6 fois par semaine, mais aujourd'hui il caser ses séances "à l'instinct" le dimanche soir, en arbitrant lui-même entre travail, famille, sommeil et les différentes disciplines qu'il pratique. C'est une charge mentale récurrente que le produit doit lui retirer.

La Feature 1 (Coach IA personnalisé, mergée — voir `07-spec-feature1-coach-ia.md`) a déjà posé deux fondations exploitées ici :

- l'onboarding conversationnel capte les **disponibilités récurrentes déclaratives** de l'utilisateur (table `availability_slots` — `docs/db-schema.md` §2), consommées mais non modifiées par cette fiche ;
- le moteur à règles décide **quoi** entraîner et **combien** (volume, charge, intensité, contenu de séance) et place chaque séance planifiée sur une **date** (`planned_sessions.scheduled_date`) et un **créneau macro** (`slot` : matin/après-midi/non-spécifié), sans heure précise.

**Frontière explicite posée par `architect` (`08-architecture.md` §11), non négociable pour cette fiche : "F1 décide QUOI et COMBIEN, F3 décide QUAND."** Cette feature ne rouvre jamais le contenu d'une séance (type, durée, charge, prescription) : elle ne fait que la positionner dans le temps — un jour et un horaire précis à l'intérieur d'un créneau disponible — et gérer les imprévus qui obligent à redéplacer une séance déjà décidée par le moteur.

**Correction du 2026-08-12** : le node `RL7Pe` ("7 — Planning semaine"), initialement décrit dans cette fiche comme "maquette hi-fi déjà validée", était en réalité un frame du **zoning bas-fidélité initial** (`06-recap.md` §5), supprimé depuis par le fondateur (nettoyage du zoning obsolète). Ce n'est pas un écran hi-fi existant : `designer` doit le concevoir entièrement avec les tokens de `docs/design-system.md`. La structure fonctionnelle qu'il portait reste une référence d'architecture d'information valable : header avec retour, une ligne par jour (Lundi à Dimanche), un bouton "Signaler un imprévu".

---

## 2. User story

> **En tant que** Thomas, avec un poste à responsabilité et une vie personnelle à gérer,
> **Je veux** un planning qui s'adapte à mon emploi du temps (travail, sport, famille) et qui absorbe mes imprévus sans que j'aie à tout recaser moi-même,
> **Afin de** m'entraîner sans passer mon dimanche soir à arbitrer à l'instinct entre course, muscu et récupération.

---

## 3. Critères d'acceptation (Given-When-Then)

### AC1 — Placement hebdomadaire sans conflit avec les indisponibilités déclarées

```
GIVEN Thomas a renseigné ses disponibilités récurrentes à l'onboarding (Feature 1 — travail, famille, sommeil)
      et le moteur à règles a produit les séances de la semaine (date, contenu, charge — décision Feature 1)
WHEN  le planning de la semaine est construit pour affichage
THEN  chaque séance est positionnée sur un jour et un horaire qui tombent dans un créneau déclaré disponible
AND   aucune séance n'est positionnée sur un créneau marqué indisponible (`availability_slots.is_available = false`)
AND   si aucun créneau disponible ne permet de caser une séance déjà décidée par le moteur dans la semaine,
      le cas est traité explicitement (voir AC6) plutôt que de forcer un placement en conflit
```

### AC2 — Ajout du placement horaire précis (F3 uniquement, sans toucher au contenu F1)

```
GIVEN une séance a été décidée par le moteur à règles (Feature 1) avec une date et un créneau macro (matin/après-midi/non-spécifié)
WHEN  le planning hebdomadaire est généré ou régénéré côté F3
THEN  un horaire précis est déterminé à l'intérieur du créneau disponible correspondant
AND   ce placement n'écrit jamais dans les champs décidés par F1 (type de séance, durée, charge, intensité, prescription)
      — seuls la date effective et l'horaire sont du ressort de cette feature
AND   si Thomas modifie ses disponibilités récurrentes après coup (Feature 1), le placement horaire de la semaine en cours
      se recalcule sans redemander une décision au moteur à règles
```

### AC3 — Signalement d'un imprévu et réajustement automatique du placement

```
GIVEN Thomas a une séance planifiée à un horaire donné cette semaine
WHEN  il signale un imprévu sur cette séance — **tranché par le fondateur le 2026-08-11** : un bouton simple
      « Je ne peux pas à ce créneau, replace-moi », sans saisie obligatoire (cohérent avec la contrainte
      « formulaire rapide » déjà appliquée en Feature 1)
THEN  le planning propose automatiquement un nouveau placement pour cette séance : un autre horaire disponible
      le même jour, ou un report sur un autre jour de la semaine dont le créneau est disponible
AND   le contenu de la séance (type, durée, charge, prescription) reste strictement inchangé — seul le placement bouge
AND   le réajustement respecte les contraintes déjà posées par le moteur à règles (espacement inter-séances,
      repos, garde-fous anti-blessure de la Feature 1 — AC8/AC10 de `07-spec-feature1-coach-ia.md`) : le replacement
      ne doit jamais créer, par exemple, deux séances intenses consécutives sans repos qui n'existaient pas dans le plan initial
AND   Thomas voit clairement, sur l'écran Planning semaine, quelle séance a été déplacée et pourquoi
AND   si la séance replacée n'est finalement pas réalisée à son nouvel horaire, un `session_log`
      (`completion = 'not_done'`) est créé — **tranché par le fondateur le 2026-08-11** : le signalement
      d'imprévu reste un événement temporel piloté par F3, mais son issue réelle doit rester visible de la
      révision hebdomadaire et de la détection de stagnation de la Feature 1 (voir §5)
```

### AC4 — Aucune séance perdue silencieusement en cas d'échec de replacement

```
GIVEN Thomas signale un imprévu sur une séance
WHEN  aucun créneau disponible restant dans la semaine ne permet de replacer cette séance sans conflit
THEN  le planning ne fait pas disparaître la séance silencieusement
AND   la séance est annulée pour la semaine en cours, avec une mention explicite visible par Thomas — **tranché
      par le fondateur le 2026-08-11**, sans report cumulatif à la semaine suivante (cohérent avec le refus déjà
      acté en Feature 1 de tout rattrapage cumulatif, AC4 de `07-spec-feature1-coach-ia.md`)
```

### AC5 — Vue dominicale de la semaine organisée

```
GIVEN Thomas consulte son planning un dimanche soir (ou tout autre jour)
WHEN  il ouvre l'écran Planning semaine
THEN  il voit sa semaine entière organisée automatiquement : une ligne par jour (Lundi à Dimanche), avec pour chaque jour
      la ou les séances positionnées à leur horaire, sans avoir à arbitrer lui-même entre les disciplines pratiquées
AND   l'aperçu semaine du Dashboard (déjà livré en Feature 1 — `weekly-preview-card.tsx`) reste cohérent avec cette vue
      détaillée : même semaine, même placements, pas de double source de vérité
```

### AC6 — Accès à la vue semaine complète soumis au paywall existant (F1)

```
GIVEN Thomas n'est pas encore abonné
WHEN  il tente d'accéder à l'écran Planning semaine
THEN  l'accès suit la même frontière paywall que celle déjà posée par la Feature 1 (AC13 de `07-spec-feature1-coach-ia.md`,
      route `/plan/week` réservée premium) : la vue semaine complète n'est pas incluse dans l'accès libre
AND   cette fiche ne redéfinit pas la règle du paywall, elle en hérite
AND   le bouton « Signaler un imprévu » sur la séance du jour reste accessible en accès libre — **tranché par le
      fondateur le 2026-08-11**, cohérent avec le principe déjà appliqué en F1 : gérer sa journée/un imprévu ne
      consomme jamais d'accès libre, seul le CONTENU premium (vue semaine complète) est verrouillé
```

---

## 4. Périmètre

### ✅ Inclus

- Placement des séances déjà décidées par le moteur à règles (Feature 1) sur un horaire précis, à l'intérieur des créneaux de disponibilité déclarés (Feature 1, `availability_slots`).
- Détection et prévention des conflits entre placement de séance et créneaux marqués indisponibles.
- Signalement d'un imprévu par Thomas sur une séance planifiée de la semaine en cours (bouton "Signaler un imprévu", écran Planning semaine — voir §1, note du 2026-08-12).
- Réajustement automatique du **placement** (jour/horaire) d'une séance suite à un imprévu, sans jamais modifier son contenu (type, durée, charge, prescription) ni rouvrir une décision de progression déjà prise par Feature 1.
- Respect des contraintes de sécurité et d'enchaînement déjà posées par le moteur à règles (repos, espacement inter-séances, garde-fous) lors du réajustement — F3 ne les redéfinit pas, elle les respecte comme contraintes de placement.
- Écran "Planning semaine" (vue dominicale, une ligne par jour) — à concevoir en hi-fi par `designer` (voir §1, note du 2026-08-12 : plus de maquette existante, seulement une référence structurelle).
- Cohérence avec l'aperçu semaine du Dashboard déjà livré en Feature 1 (`weekly-preview-card.tsx`) — évolution de ce composant pour refléter les placements horaires et les imprévus, pas de duplication d'écran.
- Héritage strict de la frontière paywall déjà posée par Feature 1 (vue semaine complète réservée aux abonnés).

### ❌ Exclu (hors scope de cette fiche)

- Toute décision sur le **contenu** d'une séance (type, durée, charge, intensité, prescription) ou sur le **volume** hebdomadaire — c'est intégralement Feature 1, qui décide QUOI et COMBIEN. F3 ne rouvre jamais ces décisions, y compris lors d'un réajustement d'imprévu.
- La saisie ou la modification des disponibilités récurrentes elles-mêmes — c'est l'onboarding de Feature 1 (`availability_slots`), déjà en place. Cette fiche ne couvre pas d'écran de gestion des disponibilités.
- L'ajustement de charge suite à un signal de fatigue/douleur/RPE post-séance (`POST /session-logs`, AC4 de Feature 1) — mécanisme distinct déjà livré, qui modifie potentiellement la charge des séances suivantes. Voir §7 pour la question ouverte sur l'articulation exacte entre les deux mécanismes.
- Connexion à un calendrier externe (Google Calendar, Outlook) ou détection automatique d'un imprévu depuis une source tierce — non mentionné dans le brainstorming ni dans le MVP, hors périmètre V1.
- Score hybride, centralisation de données (Feature 2).

---

## 5. Dépendances et contraintes

- **Tables/données existantes consommées (Feature 1, déjà en place)** :
  - `availability_slots` (`docs/db-schema.md` §2) — disponibilités récurrentes déclaratives, captées à l'onboarding. F3 les lit, ne les modifie pas dans le cadre de cette fiche.
  - `planned_sessions` (`docs/db-schema.md` §5) — porte déjà `scheduled_date` et `slot` (jour + créneau macro). **Ne porte pas d'heure précise** : `08-architecture.md` §11 identifie explicitement ce manque comme le rôle de F3 ("ajoutera le placement horaire et la gestion des imprévus, sans restructurer la table existante"). Le schéma précis de l'extension (nouvelle colonne heure ? table de placement séparée append-only pour tracer les replacements ?) est un arbitrage `architect`, pas de cette fiche.
- **Mécanisme existant articulé avec le signalement d'imprévu** : `POST /session-logs` (AC4 de Feature 1, `06-architecture.md` §6.4 / ADR-005 §5) traite déjà un signal négatif post-séance (RPE, fraîcheur, douleur) par un ajustement **synchrone à la baisse** de la charge des séances suivantes — jamais de hausse immédiate. **Tranché par le fondateur le 2026-08-11** : le signalement d'un imprévu (F3) est un événement temporel piloté par F3 (il ne déclenche jamais lui-même d'ajustement de charge), mais si la séance replacée n'est finalement pas réalisée, un `session_log` (`completion = 'not_done'`) doit être créé pour que la révision hebdomadaire et la détection de stagnation (AC5/AC6 de Feature 1) restent informées de l'adhérence réelle. `architect` définit le déclencheur technique exact de cette écriture (ex. à l'expiration de la fenêtre de replacement).
- **Paywall hérité** : l'écran Planning semaine et la vue semaine complète sont déjà couverts par la frontière paywall de Feature 1 (`/plan/week`, réservé premium, AC13). Cette fiche n'introduit pas de nouvelle règle de paywall.
- **Garde-fous hérités** : tout réajustement de placement doit respecter les garde-fous anti-blessure déjà appliqués par le moteur à règles (AC8 — plafond de séances intenses, décharge obligatoire, max de jours consécutifs sans repos ; AC10 — interférence entre disciplines). F3 ne les recalcule pas, elle doit s'assurer que le nouveau placement ne les viole pas.
- **Écrans concernés** :
  - **Planning semaine** — à concevoir en hi-fi par `designer` (voir §1) : une ligne par jour (Lun → Dim), bouton "Signaler un imprévu", structure reprise du zoning initial (aujourd'hui supprimé).
  - **Dashboard (aperçu semaine)** — composant déjà livré en Feature 1 (`apps/web/components/dashboard/weekly-preview-card.tsx`) : à faire évoluer pour refléter les placements horaires et les imprévus signalés, sans dupliquer l'écran Planning semaine (source de vérité unique).
- **Dépend d'autres US** : dépend intégralement de Feature 1 (US-01, mergée) pour les disponibilités déclaratives et les séances décidées à placer. Aucune dépendance vers Feature 2 (non construite).
- **Bloque d'autres US** : aucune identifiée à ce stade.

---

## 6. Notes UX/UI

- **Écran Planning semaine** : plus de maquette existante (zoning initial supprimé, voir §1) — `designer` le conçoit entièrement en hi-fi, en reprenant la structure fonctionnelle validée : une ligne par jour, bouton "Signaler un imprévu" par séance (ou par jour, à trancher par `designer`).
- **Flow de signalement d'un imprévu** : le contenu exact de ce que Thomas doit saisir en signalant un imprévu (texte libre ? catégories prédéfinies ? simple "je ne peux pas à ce créneau, replace-moi" sans saisie supplémentaire ?) n'est maquetté nulle part au-delà du bouton lui-même. Voir proposition et question ouverte §7. Cohérence attendue avec la contrainte "formulaire rapide" déjà appliquée à la saisie post-séance de Feature 1 (persona pressé, poste à responsabilité) : si une saisie est nécessaire, elle doit rester minimale.
- **Dashboard — aperçu semaine** : le composant existant (`weekly-preview-card.tsx`) doit évoluer pour rester cohérent avec l'écran Planning semaine détaillé (mêmes placements), sans redevenir une deuxième source de vérité. Pas de maquette dédiée à cette évolution à ce stade — à produire par `designer` en s'appuyant sur la maquette existante du Dashboard (Feature 1) et sur le nouvel écran Planning semaine qu'il aura lui-même conçu.
- Aucune maquette n'existe pour l'état "séance non replacée" (AC4) ni pour l'indication visuelle "cette séance a été déplacée suite à un imprévu" (AC3) — à produire par `designer`.

---

## 7. Questions ouvertes

### Tranchées par le fondateur le 2026-08-11

- [x] **Contenu exact du signalement d'un imprévu** → bouton simple sans saisie obligatoire. Voir AC3.
- [x] **Articulation entre le signalement d'imprévu (F3) et `POST /session-logs` (F1, AC4)** → événement temporel piloté par F3, mais crée un `session_log` `completion = 'not_done'` si la séance n'est finalement pas réalisée. Voir AC3, §5.
- [x] **Comportement quand aucun créneau disponible ne permet de replacer une séance** → séance annulée pour la semaine, mention explicite, pas de report cumulatif. Voir AC4.
- [x] **Accès au signalement d'imprévu pour un utilisateur non abonné** → accessible en accès libre, hérite du principe déjà appliqué en F1 à la saisie du jour. Voir AC6.

### Toujours ouvertes

- [ ] **Granularité de l'horaire précis (AC2).** "L'heure appartient à F3" (`08-architecture.md` §11) mais sans préciser si le placement est à la minute près, sur des sous-créneaux fixes (ex. 7h/12h30/18h30/20h), ou laissé au choix libre de Thomas dans son créneau disponible. Impacte directement le schéma de données qu'`architect` devra concevoir — délégué à `architect`, choix technique sans impact produit majeur tant que l'affichage reste lisible.
- [ ] **Fréquence/limite du signalement d'imprévu.** Aucun garde-fou produit n'est mentionné si Thomas signale un imprévu sur chaque séance de la semaine — comportement à définir (illimité, ou signal remonté au coach comme un indicateur d'inobservance à traiter en révision hebdomadaire, cf. diagnostic "inobservance" de l'AC6 Feature 1) ?

---

## 8. Prochaine étape

**Correction du 2026-08-12** : l'écran principal de cette feature (Planning semaine) n'a plus de maquette existante (le node Pencil référencé était un frame du zoning initial, supprimé) — il reste entièrement à concevoir en hi-fi, de même que le flow de signalement d'un imprévu (état "séance déplacée", état "séance non replacée") et l'évolution de l'aperçu semaine du Dashboard.

→ **Recommandation : invoquer `designer`** pour produire l'écran Planning semaine en hi-fi (à partir de la structure fonctionnelle rappelée en §1/§6) et les éléments de flow manquants, avant de passer à `architect` pour le plan technique (extension du schéma `planned_sessions`/placement horaire, arbitrage sur l'articulation avec `session_logs`, cf. questions ouvertes §7).

---

## Historique

- 2026-08-11 — Création par `spec-writer`, à partir de `03-mvp.md` (Feature 3, job story et 3 GWT haut niveau), `06-recap.md` §3/§7 et `08-architecture.md` §11 (anticipation Feature 3, frontière "F1 décide QUOI/COMBIEN, F3 décide QUAND").
- 2026-08-11 — Renumérotée US-03 (collision avec la fiche F2 due à une exécution parallèle). 4 questions ouvertes tranchées par le fondateur : contenu du signalement d'imprévu, lien avec `session_logs`, comportement en cas d'échec de replacement, accès libre au signalement. Voir §7.
- 2026-08-12 — Correction : le node Pencil `RL7Pe` cité comme "maquette hi-fi déjà validée" de l'écran Planning semaine était en réalité un frame du zoning bas-fidélité initial, supprimé par le fondateur (nettoyage sans rapport avec cette fiche). L'écran reste entièrement à concevoir en hi-fi par `designer`, à partir de la structure fonctionnelle conservée en référence (§1, §6).
