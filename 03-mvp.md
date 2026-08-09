# MVP — Hybride Club

> Phase 3 du pipeline brief-to-zoning.
> Date : 2026-07-13

## Matrice priorité

| Feature | Job Story résumée | Valeur (1-5) | Effort (1-5) | Score |
|---|---|---|---|---|
| Coach IA personnalisé (entraînement + nutrition) | Plan d'entraînement et de nutrition construit sur le profil et l'historique de Thomas, pas générique | 5 | 2 | 3 |
| Centralisation des données | Toutes les données sport + nutrition dans une seule appli | 4 | 2 | 2 |
| Planning selon emploi du temps | Planning qui s'adapte au travail, au sport, à la famille | 3 | 1 | 2 |
| Suivi de progression multi-sports (score hybride) | Progression globale sur tous les sports avec un indicateur unique | 4 | 3 | 1 |
| Itinéraires | Retrouver et sauvegarder des itinéraires dans l'appli | 2 | 4 | -2 |

## 3 features retenues

### Feature 1 — Coach IA personnalisé (entraînement + nutrition)

**Job Story :**
```
En tant que Thomas qui stagne, doute de la cohérence de son programme et gère sa nutrition à côté sans lien avec son entraînement,
Je veux un coach IA qui construit un plan d'entraînement ET de nutrition à partir de mon profil et de mon historique (pas un programme générique),
Afin de progresser avec un plan cohérent qui a vraiment du sens pour moi et pas pour "l'athlète en général".
```

**Critères Given-When-Then :**

1. **Given** Thomas vient de créer son profil (objectif, niveau, disponibilités, historique d'entraînement, habitudes alimentaires)
   **When** il valide son profil initial
   **Then** le coach IA génère un premier plan personnalisé combinant entraînement et nutrition, adapté à son niveau et son objectif

2. **Given** Thomas a complété une séance ou un repas prévu par le coach IA
   **When** il enregistre le résultat (temps, sensations, fatigue côté entraînement ; suivi côté nutrition)
   **Then** le coach IA ajuste automatiquement les séances et les recommandations nutritionnelles suivantes en fonction de sa réponse

3. **Given** Thomas stagne depuis plusieurs semaines sur un indicateur clé (temps, charge, poids, énergie)
   **When** le coach IA détecte l'absence de progression
   **Then** il propose une adaptation du plan (entraînement et/ou nutrition) avec une explication claire

### Feature 2 — Centralisation des données

**Job Story :**
```
En tant que Thomas qui jongle entre Strava, son appli muscu et un carnet Excel nutrition,
Je veux centraliser toutes mes données sportives et nutritionnelles dans une seule application,
Afin d'avoir une vision globale de ma charge, ma récupération et ma progression sans naviguer entre plusieurs outils.
```

**Critères Given-When-Then :**

1. **Given** Thomas utilise Strava, une appli muscu et un carnet nutrition Excel
   **When** il connecte ses sources de données à Hybride Club (ou saisit manuellement s'il n'y a pas d'intégration)
   **Then** toutes ses données (course, muscu, nutrition) apparaissent centralisées dans un seul tableau de bord

2. **Given** Thomas a des données de plusieurs sports enregistrées
   **When** il consulte son tableau de bord
   **Then** il visualise sa charge d'entraînement globale, sa récupération et sa progression sans changer d'application

3. **Given** une nouvelle séance ou un repas est enregistré dans une app tierce connectée
   **When** la synchronisation se déclenche
   **Then** la donnée apparaît dans Hybride Club sans ressaisie manuelle

### Feature 3 — Planning selon emploi du temps

**Job Story :**
```
En tant que Thomas avec un poste à responsabilité et une vie perso à gérer,
Je veux un planning qui s'adapte à mon emploi du temps (travail, sport, famille),
Afin de m'entraîner sans passer mon dimanche soir à essayer de tout caser à l'instinct.
```

**Critères Given-When-Then :**

1. **Given** Thomas a renseigné ses disponibilités récurrentes (créneaux travail, famille, sommeil)
   **When** l'application génère son planning de la semaine
   **Then** les séances proposées ne rentrent pas en conflit avec les créneaux indisponibles

2. **Given** un imprévu survient (réunion tardive, fatigue, empêchement)
   **When** Thomas signale l'imprévu dans l'appli
   **Then** le planning se réajuste automatiquement pour replacer ou reporter la séance sans casser la logique de progression

3. **Given** Thomas consulte son planning le dimanche soir
   **When** il ouvre l'application
   **Then** il voit sa semaine organisée automatiquement, sans devoir arbitrer lui-même entre course, muscu et récupération

## Notes

Le point « un abonnement pour tout faire » évoqué au brainstorm n'a pas été traité comme feature à part : c'est la conséquence naturelle de la Feature 2 (centralisation), pas une fonctionnalité produit distincte.

La nutrition, présente dans le brief et la persona mais absente du brainstorm initial, a été intégrée à la Feature 1 plutôt que traitée comme 4ème feature (garde-fou : 3 features max). Cohérent avec l'UVP ("s'entraîner, se nourrir et progresser").
