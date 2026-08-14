# US-02 — Centralisation des données (+ score hybride)

> Fiche fonctionnelle SDD. Rédigée par `spec-writer`. Lecture seule pour tous les autres agents.
>
> Branche : `feature/US-02-centralisation-donnees`
> Statut : ⏳ Specify
>
> Entrées : `03-mvp.md` (job story + 3 GWT haut niveau, matrice de priorité), `06-recap.md` (§3 et §7, écrans concernés), `backlog.md` (décision du 2026-08-01 rattachant le score hybride à cette feature), `08-architecture.md` §11 (anticipation schéma) et §12 point 7 (repositionnement de l'écran Connexion données), `07-spec-feature1-coach-ia.md` (référence de structure, et frontière F1/F2 sur le régime de données).

---

## 1. Contexte

Thomas (persona principale, voir `02-persona.md`) jongle aujourd'hui entre Strava, une application de musculation et un carnet Excel nutrition, sans vision globale de sa charge, sa récupération ou sa progression réelle. La Feature 1 (Coach IA personnalisé, mergée) fonctionne déjà en autonomie complète à partir de saisies déclaratives ("régime froid/déclaratif") : elle ne dépend pas de cette feature, mais son moteur à règles sait déjà distinguer `dataRegime: 'cold' | 'declared' | 'connected'` (AC12 de la Feature 1) et est conçu pour que **la donnée connectée enrichisse l'ajustement, sans jamais conditionner le fonctionnement du coach**. C'est la contrainte structurante numéro un de cette fiche : rien ici ne doit introduire, même indirectement, une dépendance dure à une source connectée.

**Le score hybride** (indicateur de progression multi-sports) a été écarté du MVP initial (`backlog.md`, effort jugé trop élevé tant que la centralisation n'existait pas), puis **réintégré au MVP le 2026-08-01** et explicitement **rattaché à cette Feature 2** : ce n'est pas une 4ème feature, c'est un agrégat calculé à partir des données que cette feature centralise. `08-architecture.md` §11 a anticipé ce besoin en normalisant `load_units` comme unité inter-disciplines commune dès la Feature 1 — c'est la matière première technique du score hybride, mais **ni sa formule de calcul, ni son unité d'affichage finale n'ont été tranchées par le fondateur à ce stade** (voir §7 Questions ouvertes).

**Point de cadrage à trancher explicitement dans cette fiche** : l'écran "Connexion données" appartient fonctionnellement à cette feature. Il avait été positionné dans le funnel d'onboarding de la Feature 1, puis **retiré du funnel V1 le 2026-08-06** (`08-architecture.md` §12 point 7) — l'onboarding route désormais directement vers le Dashboard en accès libre. Cette fiche doit donc préciser où et quand l'utilisateur accède à cet écran, maintenant qu'il n'est plus un passage obligé du parcours initial (voir AC1 et §7).

---

## 2. User story

> **En tant que** Thomas, qui jongle entre Strava, son appli muscu et un carnet Excel nutrition,
> **Je veux** centraliser toutes mes données sportives et nutritionnelles dans une seule application, et voir un indicateur unique de ma progression tous sports confondus,
> **Afin d'**avoir une vision globale de ma charge, ma récupération et ma progression sans naviguer entre plusieurs outils.

(Job story reprise telle quelle de `03-mvp.md` / `06-recap.md` §3 et §7 ; le volet "indicateur unique" reflète le rattachement du score hybride décidé le 2026-08-01 dans `backlog.md`.)

---

## 3. Critères d'acceptation (Given-When-Then)

### AC1 — Accès à l'écran Connexion données hors du funnel onboarding

```
GIVEN Thomas a terminé son onboarding Feature 1 et se trouve sur le Dashboard (accès libre ou abonné),
      sans avoir connecté ni saisi aucune source de données externe
WHEN  il consulte le Dashboard pour la première fois
THEN  une entrée visible (bandeau ou carte dédiée, non intrusive) l'invite à connecter ou déclarer ses sources de données,
      sans bloquer l'accès au plan du jour du coach IA
AND   il peut également accéder à l'écran Connexion données à tout moment depuis un point d'entrée permanent
      en section Paramètres/Compte — **tranché par le fondateur le 2026-08-11** : Dashboard (invitation non
      bloquante) + Paramètres/Compte (accès permanent)
```

### AC2 — Connexion d'une source via intégration tierce (Strava)

```
GIVEN Thomas est sur l'écran Connexion données et voit la carte "Strava" (zoning structurel de référence,
      voir §6 — écran hi-fi restant à concevoir par `designer`)
WHEN  il clique sur "Connecter" pour Strava
THEN  un flux d'autorisation démarre et, une fois complété, la carte Strava passe à l'état "connecté"
AND   les activités historiques éligibles (fenêtre à définir) et les activités futures deviennent des candidates
      de synchronisation (voir AC5)
```

**Tranché par le fondateur le 2026-08-11** : l'intégration API réelle (OAuth Strava) fait partie du périmètre de développement V1 de cette fiche — ce n'est plus une option ouverte, AC2 et AC4 sont à construire.

### AC3 — Saisie manuelle pour les sources sans intégration

```
GIVEN Thomas pratique une discipline (ex. musculation) ou suit sa nutrition via un outil sans intégration
      prévue en V1 (appli muscu, carnet nutrition)
WHEN  il sélectionne l'option "Saisir manuellement" sur l'écran Connexion données, ou saisit directement
      sur l'écran Séance/Repas du jour existant (Feature 1)
THEN  la donnée est enregistrée avec `data_source = 'declared'`, au même titre qu'une saisie post-séance
      classique de la Feature 1
AND   Thomas n'est jamais bloqué dans son usage de l'application faute d'intégration disponible pour son sport
```

### AC4 — Synchronisation automatique sans ressaisie

```
GIVEN Thomas a connecté une source intégrée (ex. Strava) avec succès (AC2)
WHEN  une nouvelle activité est enregistrée côté source tierce
THEN  elle apparaît dans Hybride Club sans ressaisie manuelle, dans un délai raisonnable après sa création
      côté source (fréquence exacte — webhook temps réel ou polling périodique — à trancher, voir §7)
AND   la donnée synchronisée porte `data_source = 'connected'` et est visible dans le tableau de bord centralisé (AC6)
```

### AC5 — Résolution de doublon déclaré / connecté

```
GIVEN Thomas a saisi manuellement une séance pour une date donnée AVANT ou APRÈS avoir connecté une source
      qui synchronise la même séance
WHEN  la donnée connectée et la donnée déclarée se recoupent (même créneau, même discipline)
THEN  l'application ne présente pas deux séances distinctes pour un même événement réel
AND   une règle de priorité explicite s'applique pour déterminer quelle version fait foi (règle exacte à
      trancher avec `architect`, voir §7) — jamais une duplication silencieuse dans les agrégats de charge
      ou dans le score hybride
```

### AC6 — Tableau de bord centralisé multi-sources

```
GIVEN Thomas a des données de plusieurs sports et/ou plusieurs sources (déclarées et/ou connectées) enregistrées
WHEN  il consulte son Dashboard
THEN  il visualise sa charge d'entraînement globale, un indicateur de récupération, et sa progression,
      agrégés tous sports et toutes sources confondus, sans changer d'application
AND   l'origine de chaque donnée (déclarée / connectée) reste identifiable si Thomas veut vérifier le détail,
      sans que cette distinction complique la lecture par défaut du tableau de bord
```

### AC7 — Calcul du score hybride à partir des données centralisées

```
GIVEN Thomas a des séances enregistrées (déclarées et/ou connectées) sur plusieurs disciplines,
      portant chacune une charge exprimée en `load_units` (unité inter-disciplines normalisée par la Feature 1,
      voir `08-architecture.md` §11)
WHEN  le score hybride est calculé pour une période donnée
THEN  il agrège les `load_units` de toutes les disciplines pratiquées par Thomas sur la période en un indicateur
      unique, présenté comme un signal de progression global plutôt que comme une moyenne de métriques disparates
AND   le score est recalculé à chaque nouvelle donnée pertinente (saisie manuelle validée ou synchronisation),
      de la même façon que le plan de la Feature 1 se régénère sur signal
```

**Tranché par le fondateur le 2026-08-11** : pas de formule figée à ce stade. `architect` propose une agrégation par défaut raisonnable des `load_units` (ex. somme pondérée à parts égales entre disciplines sur une fenêtre glissante de 7 jours), affichée comme un premier jet — au même titre que les seuils de garde-fous de la Feature 1 (AC8, tranchés a posteriori dans `docs/rulesets/`), ajustable sans refonte une fois le produit en usage réel.

### AC8 — Phase de calibration du score hybride

```
GIVEN Thomas vient de commencer à centraliser ses données (moins de X semaines de données comparables —
      seuil à aligner avec la logique de calibration de la Feature 1, AC7 de `07-spec-feature1-coach-ia.md`)
WHEN  il consulte l'écran Score hybride
THEN  l'application indique explicitement qu'elle est en phase de calibration et qu'aucun score fiable
      n'est encore disponible, plutôt que d'afficher un chiffre non représentatif
```

### AC9 — Le régime de données connecté n'est jamais une condition de fonctionnement

```
GIVEN Thomas n'a connecté ni saisi manuellement aucune donnée au-delà de ce que la Feature 1 exige déjà
      (saisie post-séance/repas)
WHEN  il utilise l'application (plan du jour, Dashboard)
THEN  l'absence de source connectée ou de tableau de bord centralisé enrichi n'empêche à aucun moment
      le fonctionnement du coach IA de la Feature 1 (cohérence stricte avec AC12 de `07-spec-feature1-coach-ia.md`)
AND   le score hybride, s'il n'a pas assez de données, affiche l'état de calibration (AC8) plutôt qu'une erreur
      ou un blocage
```

### AC10 — Déconnexion d'une source

```
GIVEN Thomas a connecté une source de données tierce
WHEN  il la déconnecte depuis l'écran Connexion données ou les Paramètres/Compte
THEN  la synchronisation future s'arrête immédiatement
AND   les données déjà synchronisées sont conservées, recatégorisées comme un historique déclaratif —
      **tranché par le fondateur le 2026-08-11**, cohérent avec le principe « jamais de perte silencieuse »
      déjà appliqué en Feature 1 — le score hybride et les agrégats du Dashboard ne sont donc pas recalculés
      rétroactivement à la baisse du seul fait de la déconnexion
```

---

## 4. Périmètre

### ✅ Inclus

- Écran "Connexion données" : liste des sources disponibles (au minimum Strava), état connecté/non connecté par source, option "Saisir manuellement" par source non intégrée — maquette Pencil hi-fi déjà validée existante (voir §6).
- Point d'entrée vers cet écran hors du funnel onboarding (proposition : Dashboard + Paramètres/Compte, voir AC1 et §7).
- Saisie manuelle des données sans intégration (déjà largement couverte par l'écran Séance/Repas du jour de la Feature 1, réutilisé/étendu ici pour les sources sans connecteur, ex. musculation, nutrition).
- Tableau de bord centralisé : agrégation multi-sports et multi-sources (déclaré + connecté) de la charge, de la récupération et de la progression, sur le Dashboard existant (évolution, pas nouvel écran).
- Résolution de doublon entre donnée déclarée et donnée connectée sur un même événement.
- Score hybride : calcul conceptuel à partir de `load_units` déjà normalisée par la Feature 1, phase de calibration explicite, affichage dans un écran dédié (nouveau, sans maquette existante — voir §6).
- Distinction technique déclaré/connecté déjà anticipée en base par `architect` (`data_source`, `athlete_profiles.data_regime`) : cette feature consomme et complète ce schéma (`data_connections`, `sync_runs`, résolution de doublons — voir §5).
- **Intégration API réelle Strava (OAuth, synchronisation automatique)** : **tranché par le fondateur le 2026-08-11**, fait partie du périmètre V1 (AC2, AC4).

### ❌ Exclu (hors scope de cette US, ou à confirmer avant développement)

- Intégrations tierces autres que Strava (appli muscu, montres connectées, autres plateformes nutrition) : traitées en saisie manuelle uniquement en V1, sans connecteur dédié — cohérent avec la maquette Pencil existante qui ne montre pas de carte dédiée pour ces sources au-delà de "Saisir manuellement".
- Formule de calcul exacte du score hybride (pondération inter-disciplines, fenêtre temporelle, traitement de la récupération) — décision produit du fondateur, non spéculée dans cette fiche (voir AC7, §7).
- Carnet alimentaire détaillé repas par repas (cohérent avec l'exclusion déjà actée en Feature 1).
- Génération ou ajustement du plan d'entraînement/nutrition : reste la responsabilité exclusive du moteur à règles de la Feature 1, qui consomme les données centralisées mais n'est pas modifié par cette fiche au-delà de la lecture du `dataRegime` déjà prévue.
- Placement des séances dans le calendrier selon les disponibilités réelles — Feature 3 (Planning).
- Communauté de sorties — hors des 3 features MVP retenues (voir `03-mvp.md`).

---

## 5. Dépendances et contraintes

- **Tables/données existantes réutilisées** : `session_logs` et `body_metrics` (colonne `data_source` `declared`/`connected` déjà présente), `athlete_profiles.data_regime` (déjà lu par le moteur à règles de la Feature 1), `load_units` (unité normalisée inter-disciplines, déjà produite par le pipeline du moteur à règles — voir `08-architecture.md` §4.2 étape 9-10 et §11).
- **Tables/données à ajouter (pressenties, à confirmer par `architect`)** : `data_connections` (état de connexion par source et par utilisateur, jetons d'accès le cas échéant), `sync_runs` (traçabilité des synchronisations, succès/échec, fenêtre synchronisée), une table ou une logique de résolution de doublons déclaré/connecté (AC5), une table pour le score hybride calculé et son historique (pour l'affichage en courbe éventuel, voir §7).
- **Endpoints/services existants utilisés** : ceux de la Feature 1 pour la lecture du profil et du régime de données (`athlete_profiles`, `PlanningContext.dataRegime`) ; l'écran Séance/Repas du jour existant est réutilisé pour la saisie manuelle (AC3), sans réécriture de son contrat d'API si son périmètre couvre déjà les disciplines concernées.
- **Intégrations tierces** : Strava (OAuth, API activités) — **statut V1 à confirmer** (voir §4, §7). Aucune autre intégration tierce de données sportives ou nutritionnelles n'est dans le périmètre de cette fiche.
- **Dépend d'autres US** : dépend de la Feature 1 pour le schéma (`data_source`, `data_regime`, `load_units`) et pour l'écran Séance/Repas du jour réutilisé en saisie manuelle. La Feature 1 ne dépend pas de cette fiche (AC12 de la Feature 1, réaffirmé en AC9 ici).
- **Bloque d'autres US** : aucune dépendance identifiée de la Feature 3 (Planning) vers cette fiche à ce stade.
- **Contrainte produit héritée de la Feature 1** : la donnée connectée doit toujours rester une couche d'enrichissement, jamais une condition de fonctionnement du coach IA ni du score hybride (AC9). Toute décision technique qui introduirait un chemin de code bloquant en l'absence de source connectée serait une régression par rapport à ce principe déjà acté.
- **Contrainte RGPD** : les données synchronisées depuis une source tierce (ex. Strava) restent des données personnelles, potentiellement de santé selon leur nature (fréquence cardiaque notamment) — à traiter avec le même niveau de rigueur que les données de santé déjà cadrées en Feature 1 (`08-architecture.md` §5.1, §8), y compris pour le comportement de déconnexion d'une source (AC10) et pour un éventuel droit à l'effacement couvrant les données importées.
- **Contrainte de cohérence de schéma** : `08-architecture.md` §11 indique que le schéma actuel est conçu pour absorber cette feature "sans refonte" — cette fiche ne doit donc pas remettre en cause les colonnes déjà posées (`data_source`, `data_regime`), seulement les compléter.

---

## 6. Notes UX/UI

- **Écran Connexion données** : **correction du 2026-08-12** — le node `SHS0X` référencé dans une version antérieure de cette fiche comme "maquette hi-fi déjà validée" était en réalité un frame du **zoning bas-fidélité initial** (`06-recap.md` §5, phase antérieure à l'intégration de la charte graphique), supprimé depuis par le fondateur (nettoyage du zoning obsolète, sans rapport avec cette fiche). Ce n'est donc PAS un écran hi-fi existant : `designer` doit le concevoir entièrement, en s'appuyant sur les tokens de `docs/design-system.md` et sur la structure fonctionnelle déjà validée par ce zoning (conservée ici comme référence d'architecture d'information) : header avec retour, une carte par source (Strava, appli muscu, nutrition) avec bouton "Connecter" par source, option "Saisir manuellement", CTA principal "Continuer" en pied de page.
- **Dashboard** : évolution de l'écran existant (Feature 1) pour y intégrer la vue centralisée multi-sources (AC6) et, potentiellement, un accès ou un aperçu du score hybride — sans dégrader la priorité éditoriale déjà actée du plan du jour du coach IA (`07-spec-feature1-coach-ia.md` §6).
- **Écran Score hybride** : **aucune maquette validée n'existe à ce stade** — travail de design restant à part entière, à mener une fois le mode de calcul (AC7) et le format d'affichage (chiffre unique ? courbe dans le temps ? décomposition par discipline ?) clarifiés avec le fondateur.
- **Séance/Repas du jour** : écran existant de la Feature 1, réutilisé pour la saisie manuelle des sources sans intégration (AC3) — vérifier avec `designer`/`architect` s'il couvre déjà toutes les disciplines pertinentes pour cette feature ou s'il nécessite une extension de son formulaire.

Maquettes : écran Connexion données déjà maquetté en hi-fi (référence ci-dessus) ; Dashboard à faire évoluer par `designer` ; écran Score hybride entièrement à concevoir.

---

## 7. Questions ouvertes

### Tranchées par le fondateur le 2026-08-11

- [x] **Où et quand l'utilisateur connecte ses sources de données** → Dashboard (invitation non bloquante) + Paramètres/Compte (accès permanent). Voir AC1.
- [x] **Intégration API réelle Strava en V1** → oui, dans le périmètre. Voir AC2, AC4, §4.
- [x] **Formule de calcul du score hybride** → pas de formule figée, `architect` propose un défaut raisonnable (agrégation `load_units`), ajustable ultérieurement comme les seuils de garde-fous de F1. Voir AC7.
- [x] **Comportement à la déconnexion d'une source** → données déjà synchronisées conservées comme historique déclaratif, pas de suppression ni de recalcul rétroactif à la baisse. Voir AC10.

### Toujours ouvertes

- [ ] **Quel format d'affichage pour le score hybride** (chiffre unique, courbe temporelle, décomposition par discipline) ? Aucune maquette n'existe — à concevoir par `designer` une fois la formule par défaut d'`architect` connue.
- [ ] **Quelle fréquence de synchronisation** pour une source connectée (webhook temps réel côté Strava vs polling périodique) ? Impact direct sur le "délai raisonnable" mentionné en AC4 — délégué à `architect`, choix technique sans impact produit visible tant que le délai reste raisonnable.
- [ ] **Quelle règle de priorité exacte pour la résolution de doublon déclaré/connecté** (AC5) : la donnée connectée écrase-t-elle systématiquement la donnée déclarée sur un même créneau, ou l'utilisateur est-il sollicité pour arbitrer ? À trancher avec `architect`.
- [ ] **Quelles sources au-delà de Strava sont réellement candidates à une intégration future** (appli muscu, plateforme nutrition) et sur quel horizon — pour cadrer si la maquette actuelle ("Saisir manuellement" pour ces sources) reste valable au-delà de la V1 ?
- [ ] **Seuil exact de la phase de calibration du score hybride** (AC8) : même durée que la calibration du diagnostic de stagnation de la Feature 1 (4 semaines glissantes, AC7 de `07-spec-feature1-coach-ia.md`) ou seuil propre à cette feature ?
- [ ] **Traitement RGPD spécifique aux données importées d'une source tierce** : un consentement dédié est-il nécessaire en plus du consentement santé déjà recueilli en Feature 1, notamment si Strava synchronise des données de fréquence cardiaque ou de sommeil ?

---

## 8. Prochaine étape

Cette feature a une dimension UI/UX significative : l'écran Connexion données dispose déjà d'une maquette hi-fi validée (à adapter uniquement sur son point d'entrée dans le parcours), le Dashboard doit évoluer pour la vue centralisée, et l'écran Score hybride est entièrement à concevoir, sans maquette existante.

→ **Recommandation : invoquer `designer`** pour (1) repositionner l'écran Connexion données dans le parcours post-onboarding, (2) faire évoluer le Dashboard vers la vue centralisée multi-sources, et (3) concevoir l'écran Score hybride une fois les questions ouvertes sur son calcul et son format d'affichage tranchées avec le fondateur — avant de passer à `architect` pour le plan technique (schéma `data_connections`/`sync_runs`, contrat de résolution de doublons, contrat de calcul du score hybride).

---

## Historique

- 2026-08-11 — Création par `spec-writer`, à partir de `03-mvp.md`, `06-recap.md`, `backlog.md` (décision du 2026-08-01) et `08-architecture.md` §11/§12 point 7.
- 2026-08-11 — 4 questions ouvertes tranchées par le fondateur : point d'entrée Dashboard+Paramètres, OAuth Strava réel en V1, formule du score hybride en défaut ajustable, conservation des données à la déconnexion. Voir §7.
- 2026-08-12 — Correction : le node Pencil `SHS0X` cité comme "maquette hi-fi déjà validée" de l'écran Connexion données était en réalité un frame du zoning bas-fidélité initial, supprimé par le fondateur (nettoyage sans rapport avec cette fiche). L'écran reste entièrement à concevoir en hi-fi par `designer`, à partir de la structure fonctionnelle conservée en référence (AC2, §6).
