# US-01 — Coach IA personnalisé (entraînement + nutrition)

> Fiche fonctionnalité SDD. Rédigée par `spec-writer`. Lecture seule pour tous les autres agents.
>
> Branche : `feature/US-01-coach-ia-personnalise`
> Statut : ⏳ Specify

---

## 1. Contexte

Thomas (persona principale, voir `02-persona.md`) s'entraîne 5 à 6 fois par semaine mais stagne depuis plusieurs mois. Il navigue à l'aveugle : programme dont il doute de la cohérence, nutrition gérée séparément de l'entraînement, données éclatées. Son réflexe naturel face à la stagnation est d'ajouter du volume ou de pousser plus fort — ce qui l'expose au surentraînement et à la blessure plutôt que de résoudre le problème.

Un coach humain privé coûte 150-300€/mois avec ses propres méthodes et son propre agenda imposé (voir `01-brief.md`). L'UVP du produit ("m'aider à s'entraîner, se nourrir et progresser grâce à un coach IA") repose sur la capacité à délivrer, à un prix accessible, un accompagnement aussi cohérent qu'un coach humain, mais personnalisé au profil réel de chaque utilisateur et non à une méthode figée.

**Point de cadrage important (2026-08-01), qui prime sur toute mention contraire dans le brainstorming initial ou dans `01-brief.md` avant cette date** : le coach IA de cette feature **n'est pas construit à partir de l'expertise personnelle du fondateur**. Le fondateur a tranché explicitement : le moteur de règles du coach est **autonome**, construit et documenté de façon indépendante (recherche en littérature sportive, bonnes pratiques d'entraînement et de nutrition, sources publiques et scientifiques), et couvre **tous les sports pratiqués par l'utilisateur**, pas seulement les disciplines historiques du club Hybride (course, vélo, trail, danse, triathlon, muscu). C'est un axe de différenciation produit assumé malgré l'effort supplémentaire que cela représente. Toute formulation du type "conçu à partir de l'expertise d'un vrai coach" est **interdite** dans le produit et dans cette fiche — y compris dans la réponse au frein persona "Est-ce que ça vaut le coup par rapport à un coach humain ?", qui doit être repensée sur d'autres arguments (personnalisation continue, auditabilité des règles, disponibilité 24/7, prix).

Le score hybride (indicateur de progression multi-sports) a été réintégré au MVP le 2026-08-01 mais **rattaché à la Feature 2 — Centralisation des données** (voir `backlog.md`). Il ne fait pas partie du périmètre de cette fiche.

---

## 2. User story

> **En tant que** Thomas, qui stagne, doute de la cohérence de son programme et gère sa nutrition à côté sans lien avec son entraînement,
> **Je veux** un coach IA qui construit et ajuste en continu un plan d'entraînement ET de nutrition à partir de mon profil, de mon historique et de mes signaux de la vie réelle (pas un programme générique),
> **Afin de** progresser avec un plan cohérent, expliqué, et qui a vraiment du sens pour moi — sans risquer de me blesser par excès de zèle.

---

## 3. Critères d'acceptation (Given-When-Then)

### AC1 — Génération du plan initial après onboarding

```
GIVEN Thomas vient de terminer la conversation d'onboarding avec le coach IA
      (objectif, date cible, niveau, historique d'entraînement, sport(s) pratiqué(s) — tous sports confondus,
      disponibilités déclaratives, habitudes alimentaires, filtre de profils à risque)
WHEN  il valide son profil initial
THEN  le moteur à règles génère un premier plan personnalisé combinant entraînement et nutrition,
      calé en "régime froid" (volume de démarrage prudent, sous le volume déclaré par Thomas)
AND   le plan est découpé en blocs macro (aujourd'hui → date d'objectif), avec un détail complet sur J → J+7,
      un aperçu "intention" sur J+8 → J+14, et une vue macro par blocs (base / développement / spécifique / affûtage) au-delà
AND   chaque recommandation du jour est accompagnée d'une explication courte citant la donnée précise qui l'a justifiée
      (pas de justification générique)
```

### AC2 — Objectif hors de portée détecté à l'onboarding

```
GIVEN Thomas déclare un objectif et une date cible pendant l'onboarding
WHEN  le moteur à règles évalue que l'objectif est irréaliste compte tenu du niveau, de l'historique et du délai déclarés
THEN  le coach IA ne génère pas silencieusement un plan inatteignable
AND   il propose explicitement une négociation d'objectif (objectif intermédiaire réaliste ou délai ajusté), avec l'explication du raisonnement
AND   Thomas peut accepter la proposition ou confirmer son objectif initial en connaissance de cause
```

### AC3 — Filtre de sécurité et disclaimer à l'onboarding

```
GIVEN Thomas est en cours de conversation d'onboarding
WHEN  le coach IA pose la question filtre sur les profils à risque (mineur, grossesse, pathologie déclarée, antécédents de troubles alimentaires)
      et présente le disclaimer produit
THEN  le disclaimer "le coach IA n'est pas un dispositif médical ni un professionnel de santé" est affiché et doit être explicitement acquitté
AND   si un profil à risque est détecté, le coach IA adapte son comportement (limitation des recommandations, orientation vers un professionnel de santé,
      ou blocage de la génération de plan nutritionnel avec déficit calorique) plutôt que de poursuivre un onboarding standard
AND   le consentement explicite au traitement des données de santé (FC, sommeil, poids, douleur) est recueilli séparément avant toute saisie de ces données
```

### AC4 — Saisie post-séance/repas et ajustement immédiat à la baisse

```
GIVEN Thomas a une séance ou un repas prévu par le coach IA pour aujourd'hui
WHEN  il enregistre le résultat sur l'écran Séance/Repas du jour
      (séance réalisée oui/partiellement/non + raison, RPE ressenti 1-10, fraîcheur/sommeil 1-5,
      douleur/gêne non/légère/douleur + localisation + question conditionnelle "présente aussi au repos ?" affichée
      uniquement si "douleur" est sélectionné (nécessaire pour distinguer AC9 niveau 2 et niveau 3) ;
      côté nutrition : adhérence sur 3 niveaux + énergie ressentie)
THEN  si un signal négatif est détecté (RPE élevé, douleur, fraîcheur basse), le moteur à règles peut baisser la charge
      des prochaines séances immédiatement, sans attendre la révision hebdomadaire
AND   une hausse de charge, elle, n'est jamais appliquée immédiatement sur un signal positif isolé : elle est réservée
      à la révision hebdomadaire du dimanche (asymétrie prudente contre le surentraînement)
AND   si Thomas n'a pas réalisé la séance, le coach ne fait apparaître ni "retard" ni rattrapage cumulatif :
      il reprogramme à partir de la situation réelle du jour
```

### AC5 — Révision hebdomadaire ritualisée avec diff explicable

```
GIVEN une semaine de saisies (séances, repas, signaux) s'est écoulée
WHEN  la révision hebdomadaire se déclenche le dimanche soir
THEN  Thomas reçoit une notification "ta semaine est prête"
AND   le plan de la semaine suivante (méso : fin de bloc éventuelle ; micro : semaine à venir) est régénéré par le moteur à règles
AND   un "diff" lisible est affiché : ce qui a changé par rapport à la semaine précédente et pourquoi, avec un lien
      "en savoir plus" donnant le raisonnement complet en plus de l'explication courte par défaut
```

### AC6 — Détection de stagnation avec diagnostic différencié

```
GIVEN Thomas a au moins 4 semaines glissantes de données comparables à la période équivalente précédente
WHEN  le coach IA détecte une absence de progression sur un indicateur clé (temps, charge, poids, énergie)
THEN  il pose un diagnostic explicite parmi les 3 causes distinctes possibles :
      sous-stimulation (augmenter/varier), surcharge/fatigue accumulée (décharger), ou inobservance (ajuster le volume à la réalité de vie)
AND   il propose une adaptation du plan (entraînement et/ou nutrition) cohérente avec ce diagnostic, avec une explication claire
AND   il ne recommande jamais de "durcir" le plan en réponse à une inobservance détectée
```

### AC7 — Phase de calibration explicite (avant 4 semaines de données)

```
GIVEN Thomas a moins de 4 semaines glissantes de données
WHEN  il consulte une analyse de progression ou une tentative de détection de stagnation
THEN  le coach IA indique explicitement qu'il est en phase de calibration (2-3 premières semaines) et qu'aucun diagnostic fiable
      n'est encore possible, plutôt que d'afficher une fausse assurance ou un diagnostic non fondé
```

### AC8 — Garde-fous anti-blessure (bornes dures non contournables)

```
GIVEN un plan est en cours de génération ou de régénération, quel que soit le régime de données (froid, déclaratif, connecté)
WHEN  le moteur à règles calcule le volume et la charge de la semaine suivante
THEN  il respecte systématiquement : un plafond de progression hebdomadaire de charge/volume, un plafond de séances intenses
      par semaine, une semaine de décharge obligatoire tous les N blocs (non désactivable en V1), un nombre maximum de jours
      consécutifs sans repos
AND   tant qu'un signal de fatigue ou de douleur actif est présent (voir AC4 et AC9), toute hausse de charge est bloquée
      indépendamment de l'échéance de révision hebdomadaire
```

### AC9 — Protocole douleur à 3 niveaux

```
GIVEN Thomas signale une douleur ou une gêne sur l'écran Séance/Repas du jour
WHEN  le niveau déclaré est "gêne légère"
THEN  le coach IA adapte la séance concernée (intensité, contenu) sans alerte supplémentaire

GIVEN Thomas signale une douleur persistante sur plusieurs séances consécutives sur la même zone
WHEN  le moteur détecte cette récurrence
THEN  il met en pause la sollicitation de cette zone dans le plan et recommande explicitement une consultation professionnelle

GIVEN Thomas déclare une douleur aiguë présente à la fois à l'effort ET au repos
      (niveau "douleur" sélectionné, puis réponse "oui" à la question conditionnelle "présente aussi au repos ?")
WHEN  cette combinaison de signaux est enregistrée
THEN  le coach IA arrête de programmer toute sollicitation sur cette zone et renvoie explicitement l'utilisateur
      vers un professionnel de santé, sans proposer d'alternative d'auto-adaptation
```

**Note technique (2026-08-05)** : la distinction niveau 2 / niveau 3 nécessite explicitement de savoir si la douleur est présente au repos — ce champ (`pain_at_rest`, booléen conditionnel affiché uniquement si le niveau "douleur" est sélectionné) a été identifié manquant par `architect` lors du cadrage technique et ajouté à la maquette Séance/Repas du jour (voir AC4) et au schéma de données.

### AC10 — Interférence entre disciplines pratiquées en parallèle

```
GIVEN Thomas pratique plusieurs disciplines en parallèle (ex. course à pied et musculation, ou triathlon et danse)
WHEN  le moteur à règles construit ou régénère le plan
THEN  il gère explicitement l'interférence entre séances : espacement minimal entre une séance intense d'une discipline
      et une séance de force sollicitant les mêmes groupes musculaires, répartition de la charge globale (et non par sport isolé)
AND   l'explication associée à une séance mentionne, le cas échéant, qu'elle a été positionnée ou allégée pour tenir compte
      d'une autre discipline pratiquée par Thomas
```

### AC11 — Nutrition modulée à la séance, sans carnet détaillé

```
GIVEN Thomas a un plan d'entraînement actif avec des séances de charges différentes selon les jours
WHEN  le coach IA génère les recommandations nutritionnelles du jour
THEN  les cibles caloriques et macros du jour sont modulées selon la séance prévue (repos, endurance, intensité)
AND   des conseils avant / pendant / après séance sont fournis en cohérence avec la séance du jour
AND   Thomas ne se voit jamais demandé de tenir un carnet alimentaire détaillé repas par repas — seule une saisie légère
      (adhérence sur 3 niveaux + énergie ressentie, voir AC4) est requise
AND   aucune recommandation nutritionnelle générée n'implique un déficit calorique agressif ni une consigne de perte de poids
      sans plancher de sécurité explicite
```

### AC12 — Fonctionnement en régime froid (sans données connectées)

```
GIVEN Thomas vient de terminer son onboarding et n'a connecté aucune source de données externe (Feature 2 non utilisée)
WHEN  le coach IA génère et ajuste son plan
THEN  il fonctionne en "régime déclaratif / froid" : profil déclaratif + saisies manuelles post-séance/repas suffisent
      à générer un premier plan et à l'ajuster dans la durée
AND   la disponibilité future de données connectées (Strava, montre, via Feature 2) enrichit l'ajustement
      (régime connecté, objectivation des signaux) mais n'est jamais une condition pour que le coach fonctionne
```

### AC13 — Frontière paywall (accès libre vs abonné)

```
GIVEN Thomas a terminé son onboarding et n'est pas encore abonné
WHEN  il consulte le Dashboard ou l'écran Séance/Repas du jour
THEN  il voit le plan du jour et son explication courte, jusqu'à 3 accès par semaine
AND   au-delà de 3 accès dans la semaine, ou pour accéder à la vue semaine complète, à la vision macro par blocs,
      ou à des ajustements automatiques illimités, l'accès est bloqué et redirige vers l'écran Paiement abonnement
AND   une fois abonné, toutes ces limitations disparaissent immédiatement (voir état "succès débloqué" du Dashboard, `04-flow.md`)
```

### AC14 — Fin d'objectif atteint

```
GIVEN la date cible de l'objectif de Thomas est atteinte ou dépassée
WHEN  Thomas ouvre l'application après cette date
THEN  le coach IA ne laisse pas un vide dans le plan : il propose explicitement soit un nouvel objectif à définir,
      soit une phase de transition/récupération encadrée, avec explication du choix proposé
```

---

## 4. Périmètre

### ✅ Inclus

- Onboarding conversationnel avec le coach IA (chat) : recueil objectif, date cible, niveau, historique, sport(s) pratiqué(s) — tous sports confondus, disponibilités déclaratives (transmises à Feature 3), habitudes alimentaires, filtre profils à risque, disclaimer et consentement RGPD données de santé.
- Génération du plan initial (entraînement + nutrition) par un moteur à règles, à trois échelles : macro (blocs jusqu'à l'objectif), méso (bloc de 3-4 semaines), micro (semaine).
- Détail complet J → J+7, aperçu "intention" J+8 → J+14, vue macro par blocs au-delà.
- Régénération hebdomadaire ritualisée (dimanche soir) avec diff explicable.
- Ajustement à deux vitesses : baisse immédiate sur signal négatif, hausse uniquement à la révision hebdomadaire.
- Saisie post-séance/repas à 4 signaux (réalisation, RPE, fraîcheur/sommeil, douleur) + check-in nutrition léger (adhérence 3 niveaux + énergie ressentie).
- Détection de stagnation sur fenêtre de 4 semaines glissantes avec 3 diagnostics différenciés (sous-stimulation, surcharge, inobservance) et phase de calibration explicite les 2-3 premières semaines.
- Explicabilité systématique : justification courte par recommandation citant la donnée déclenchante, "en savoir plus" avec raisonnement complet, capacité du coach à dire "je ne sais pas encore".
- Garde-fous algorithmiques : plafonds de progression, plafond de séances intenses, décharge obligatoire non désactivable, volume initial prudent, blocage de hausse sur signal actif, max de jours consécutifs sans repos.
- Protocole douleur à 3 niveaux (adaptation / pause + recommandation de consultation / arrêt et orientation professionnel de santé).
- Gestion explicite de l'interférence entre disciplines pratiquées en parallèle (espacement, répartition de charge globale), sur toutes disciplines, pas seulement celles du club Hybride.
- Nutrition niveau intermédiaire : cibles caloriques/macros modulées à la séance, conseils avant/pendant/après séance, check-in léger — sans carnet alimentaire détaillé.
- Comportement défini en cas d'objectif irréaliste déclaré (négociation d'objectif) et en fin d'objectif atteint (nouvel objectif ou transition).
- Fonctionnement complet dès le régime froid (déclaratif seul), sans dépendance à la Feature 2.
- Cadre légal/éthique : disclaimer non-dispositif-médical, question filtre profils à risque, garde-fous nutrition (pas de déficit agressif, plancher de sécurité), consentement RGPD explicite données de santé.
- Frontière paywall : accès libre plafonné à 3 accès/semaine au plan du jour + explication ; reste réservé aux abonnés.
- Revue qualité asynchrone du fondateur sur les plans initiaux générés pendant la phase de lancement, positionnée comme **contrôle qualité externe sur un moteur autonome** (réassurance produit, boucle d'amélioration continue), et non comme validation de règles personnelles du fondateur.
- Écrans concernés : Onboarding profil (chat coach IA), Paiement abonnement, Dashboard, Séance/Repas du jour.

### ❌ Exclu (hors scope de cette US)

- Score hybride (indicateur de progression multi-sports) — rattaché à **Feature 2 — Centralisation des données** (voir `backlog.md`, décision du 2026-08-01).
- Placement des séances dans le calendrier selon disponibilités réelles (créneaux travail/famille/sommeil, gestion des imprévus) — c'est **Feature 3 — Planning**, qui décide QUAND. Feature 1 décide uniquement QUOI et COMBIEN (contenu et volume du plan).
- Connexion et synchronisation de sources de données tierces (Strava, appli muscu) et centralisation du tableau de bord multi-sources — **Feature 2**. Feature 1 consomme les données objectives de Feature 2 quand elles existent (régime connecté) mais ne les collecte pas.
- Carnet alimentaire détaillé repas par repas.
- Coaching humain, mise en relation avec un coach ou un professionnel de santé au-delà d'une recommandation textuelle d'orientation.
- Toute mention produit présentant le moteur du coach IA comme conçu à partir de l'expertise personnelle du fondateur.
- Communauté de sorties (mentionnée dans l'UVP globale mais hors des 3 features MVP retenues, voir `03-mvp.md`).

---

## 5. Dépendances et contraintes

- **Tables/données concernées (pressenties, à confirmer par `architect`)** : profil utilisateur (objectif, date cible, niveau, sport(s), disponibilités déclaratives, habitudes alimentaires, statut profil à risque, consentements RGPD) ; plan (macro/méso/micro, versions successives) ; séance planifiée / réalisée ; saisie post-séance (réalisation, RPE, fraîcheur, douleur + localisation) ; repas planifié / check-in nutrition (adhérence, énergie ressentie) ; historique de diagnostics de stagnation ; log d'explications générées (traçabilité/auditabilité des décisions du moteur à règles) ; statut d'abonnement (pour la frontière paywall) ; compteur d'accès libre hebdomadaire.
- **Endpoints/services existants utilisés** : aucun existant — c'est la première feature du produit. Point de départ pour `architect`.
- **Intégrations tierces** : un LLM pour la conversation d'onboarding, l'explicabilité en langage naturel, et la reformulation en cas d'incompréhension (voir états d'erreur `04-flow.md` : "réponse utilisateur incompréhensible, le coach reformule sa question"). Le LLM **n'a jamais autorité** sur le contenu chiffré du plan (volume, charge, intensité) — cette responsabilité reste exclusivement au moteur à règles, pour auditabilité et sécurité anti-blessure. Aucune intégration tierce de données sportives dans le périmètre de cette fiche (voir Feature 2).
- **Dépend d'autres US** : aucune (Feature 1 est fondatrice, doit fonctionner en autonomie complète dès le régime froid).
- **Funnel V1** : l'écran "Connexion données" (`05-zoning-pencil.md`, écran n°3) appartient à la Feature 2, non construite à ce stade — **décision du 2026-08-06** : il est retiré du funnel pour la V1, qui route directement de l'onboarding chat vers le Dashboard (accès libre). Voir `04-flow.md`, révision du 2026-08-06, pour le détail du funnel V1 vs funnel cible.
- **Bloque d'autres US** : Feature 3 (Planning) dépend des disponibilités déclaratives captées par l'onboarding de Feature 1 pour placer les séances dans le calendrier. Feature 2 (score hybride) pourra consommer les données de progression issues de Feature 1 une fois construite.
- **Contrainte légale/éthique** : disclaimer "n'est pas un dispositif médical ni un professionnel de santé" obligatoire et visible ; question filtre à l'onboarding pour profils à risque (mineur, grossesse, pathologie déclarée, antécédents de troubles alimentaires) ; jamais de déficit calorique agressif ni de recommandation de perte de poids sans plancher de sécurité ; RGPD — données de santé (FC, sommeil, poids, douleur) traitées comme catégorie sensible avec consentement explicite distinct.
- **Contrainte produit (paywall)** : accès libre plafonné à 3 accès/semaine au plan du jour + explication courte uniquement ; vue semaine complète, vision macro, ajustements automatiques illimités réservés aux abonnés.
- **Contrainte d'auditabilité** : toute décision de volume/charge/intensité doit pouvoir être tracée à une règle et à une donnée d'entrée précise (nécessaire pour la revue qualité asynchrone du fondateur et pour la transparence utilisateur — AC5).
- **Score hybride** : ne fait pas partie de la Feature 1 ; vit dans Feature 2 (Centralisation des données) — mentionné ici uniquement pour clarifier la frontière.

---

## 6. Notes UX/UI

- Onboarding : conversation chat, ~5 min, une question ciblée à la fois, état de chargement "le coach écrit sa réponse", état d'erreur avec reformulation (voir `04-flow.md` et `05-zoning-pencil.md`). Le disclaimer et le consentement RGPD données de santé doivent être des étapes explicites et non noyées dans le flux conversationnel.
- Dashboard : le plan du jour du coach IA est affiché en premier, mis en avant visuellement (bordure accent) — priorité éditoriale confirmée par le zoning.
- Séance/Repas du jour : formulaire de saisie post-séance/repas limité à 4 signaux entraînement + 2 signaux nutrition, pour rester rapide à remplir (persona pressé, poste à responsabilité).
- Explicabilité : prévoir deux niveaux d'affichage sur chaque recommandation — explication courte par défaut, lien "en savoir plus" pour le raisonnement complet (persona plutôt technique/informée, cf. freins persona sur la confiance envers l'algorithme).
- Diff hebdomadaire (dimanche soir) : nécessite un composant dédié de comparaison lisible avant/après, pas seulement un nouveau plan affiché brut.
- Paywall : le blocage au-delà de 3 accès/semaine et pour la vue semaine complète doit être visuellement clair mais non punitif (cohérent avec la stratégie produit "attachement avant conversion", voir `04-flow.md`).

Maquettes : à produire par `designer` (non disponibles à ce stade — pas de wireframes hi-fi existants au-delà du zoning Pencil bas-fidélité de `05-zoning-pencil.md`).

---

## 7. Questions ouvertes

- [ ] Quelles sont les sources documentaires précises (littérature sportive, référentiels) sur lesquelles s'appuiera la construction initiale du moteur à règles autonome, et qui en assure la maintenance/mise à jour dans la durée ?
- [x] ~~Quel est le nombre exact N de blocs entre deux semaines de décharge obligatoire, et les valeurs précises des plafonds de progression hebdomadaire / séances intenses / jours consécutifs sans repos ?~~ **Proposition sourcée déposée le 2026-08-06** dans `docs/rulesets/0.1.0-dev.md` (progression hebdo 10 %, 2 séances intenses/semaine max, décharge tous les 1 bloc méso à -45 % de volume, 6 jours consécutifs max sans repos) — **en attente de validation finale du fondateur** avant publication du ruleset `1.0.0` en production (voir ADR-007).
- [x] ~~Quelle formulation exacte adopter pour répondre au frein persona "coach IA vs coach humain" maintenant que l'argument "conçu par un vrai coach" est exclu ?~~ **Tranché le 2026-08-04** : toute comparaison chiffrée au coach humain privé (150-300€/mois) est retirée du produit et du copywriting. La réponse au frein s'appuie exclusivement sur les qualités propres du coach IA : disponibilité 24/7, adaptation continue au profil sportif réel de l'utilisateur, auditabilité des règles (voir aussi la note de cadrage du 2026-08-01 ci-dessus). Impact : le contenu de l'écran Paiement abonnement (maquette Pencil, frame `Yf6zY`) doit être mis à jour pour retirer la comparaison de prix et la remplacer par ces arguments qualitatifs.
- [ ] Quel est le processus concret de revue qualité asynchrone du fondateur (fréquence, échantillon de plans revus, canal de remontée d'anomalie vers l'équipe produit) ?
- [ ] Le compteur "3 accès par semaine" en accès libre se réinitialise-t-il un jour fixe (ex. lundi) ou glissant sur 7 jours ?
- [ ] Quel est le format et la source d'un objectif "irréaliste" — barème générique par discipline, ou modèle statistique alimenté par l'historique agrégé des utilisateurs au fil du temps ?
- [ ] Comment le moteur à règles couvre-t-il, dès la V1, un sport déclaré rare/non documenté par le fondateur (limite du périmètre "tous sports confondus") — refus, plan générique prudent, ou apprentissage progressif ?
- [ ] Quel comportement précis en phase de transition post-objectif si Thomas n'interagit pas dans un délai donné après la date cible (relance, désabonnement passif) ?

---

## 8. Prochaine étape

Cette feature a une dimension UI/UX forte (onboarding conversationnel, dashboard avec plan du jour mis en avant, écran de saisie quotidienne, diff hebdomadaire, paywall) déjà zonée en basse fidélité dans `05-zoning-pencil.md` mais sans maquettes hi-fi ni charte graphique.

→ **Recommandation : invoquer `designer`** pour produire les wireframes/maquettes hi-fi de l'Onboarding profil (chat), du Dashboard, de l'écran Séance/Repas du jour et de la frontière paywall, avant de passer à `architect` pour le plan technique (stack, schéma de données, découpage moteur à règles / service LLM / API).

---

## Historique

- 2026-08-01 — Création par `spec-writer`, à partir de `06-recap.md` (Feature 1) et du cadrage de brainstorming du 2026-08-01 (voir notes datées dans `01-brief.md` et `backlog.md`).
