# Recap projet — Hybride Club

> Sortie finale du pipeline brief-to-zoning.
> Slug : `hybride-club`
> Démarré le : 2026-07-05
> Complété le : 2026-07-26

## 1. Brief

**Idée :** Le QG de ta performance.

**3 critères :**
- Domaine : ✓ (coach expérimenté, fondateur du club « Hybride », formé par les meilleurs entraîneurs de la région)
- Problème : ✓ (validé par 30 interviews ; coach privé à 150-300€/mois, planning et nutrition mal maîtrisés)
- Cible : ✓ (1 à 2M de personnes en France, sportifs débutants à intermédiaires visant un objectif)

**UVP :** J'aide les sportifs préparant un objectif à s'entraîner, se nourrir et progresser grâce à un coach IA, un planning et une communauté de sorties.

**BM préliminaire :** BtoC, modèle SaaS par abonnement

## 2. Persona principale

**Thomas** — Le Chef de projet performant · 31 ans · 📍 Lyon · CDI, poste à responsabilité

Thomas s'entraîne 5 à 6 fois par semaine mais stagne depuis plusieurs mois, avec des données éclatées entre Strava, une appli muscu et un carnet Excel nutrition, sans vision globale de sa charge, sa récupération ou sa progression réelle.

**3 motivations :**
1. Gagner du temps mental et de la charge cognitive en déléguant la planification course+muscu à un système fiable
2. Avoir une vision claire de sa progression réelle avec des métriques concrètes plutôt que naviguer à l'instinct
3. Réduire le risque de blessure/surentraînement grâce à un ajustement intelligent de la charge

**Frein principal :** « Est-ce que ça vaut vraiment le coup par rapport à un coach humain ? » — doute sur la légitimité d'une IA face à l'expertise humaine

**Sourcing :** 0% d'hypothèses, 30 interviews effectuées (+ interviews dédiées à la persona)

## 3. MVP — 3 fonctionnalités

### Feature 1 — Coach IA personnalisé (entraînement + nutrition)

**Job Story :**
```
En tant que Thomas qui stagne, doute de la cohérence de son programme et gère sa nutrition à côté sans lien avec son entraînement,
Je veux un coach IA qui construit un plan d'entraînement ET de nutrition à partir de mon profil et de mon historique,
Afin de progresser avec un plan cohérent qui a vraiment du sens pour moi.
```

**Score priorité :** Valeur 5, Effort 2 → 3

**Critères Given-When-Then :**
1. Given Thomas vient de créer son profil, When il valide son profil initial, Then le coach IA génère un premier plan personnalisé combinant entraînement et nutrition
2. Given Thomas a complété une séance ou un repas prévu, When il enregistre le résultat, Then le coach IA ajuste automatiquement les séances et recommandations suivantes
3. Given Thomas stagne depuis plusieurs semaines sur un indicateur clé, When le coach IA détecte l'absence de progression, Then il propose une adaptation du plan avec une explication claire

**Écrans concernés :** Onboarding profil, Paiement abonnement, Dashboard, Séance/Repas du jour

### Feature 2 — Centralisation des données

**Job Story :**
```
En tant que Thomas qui jongle entre Strava, son appli muscu et un carnet Excel nutrition,
Je veux centraliser toutes mes données sportives et nutritionnelles dans une seule application,
Afin d'avoir une vision globale de ma charge, ma récupération et ma progression.
```

**Score priorité :** Valeur 4, Effort 2 → 2

**Critères Given-When-Then :**
1. Given Thomas utilise Strava, une appli muscu et un carnet nutrition Excel, When il connecte ses sources (ou saisit manuellement), Then toutes ses données apparaissent centralisées dans un seul tableau de bord
2. Given Thomas a des données de plusieurs sports enregistrées, When il consulte son tableau de bord, Then il visualise sa charge, sa récupération et sa progression sans changer d'application
3. Given une nouvelle séance ou un repas est enregistré dans une app tierce connectée, When la synchronisation se déclenche, Then la donnée apparaît dans Hybride Club sans ressaisie manuelle

**Écrans concernés :** Connexion données, Dashboard, Séance/Repas du jour (saisie manuelle)

### Feature 3 — Planning selon emploi du temps

**Job Story :**
```
En tant que Thomas avec un poste à responsabilité et une vie perso à gérer,
Je veux un planning qui s'adapte à mon emploi du temps,
Afin de m'entraîner sans passer mon dimanche soir à essayer de tout caser à l'instinct.
```

**Score priorité :** Valeur 3, Effort 1 → 2

**Critères Given-When-Then :**
1. Given Thomas a renseigné ses disponibilités récurrentes, When l'application génère son planning de la semaine, Then les séances proposées ne rentrent pas en conflit avec les créneaux indisponibles
2. Given un imprévu survient, When Thomas le signale dans l'appli, Then le planning se réajuste automatiquement sans casser la logique de progression
3. Given Thomas consulte son planning le dimanche soir, When il ouvre l'application, Then il voit sa semaine organisée automatiquement

**Écrans concernés :** Onboarding profil (dispos), Dashboard (aperçu), Planning semaine

## 4. Flow user

**Total écrans :** 9 (max 10)

**Diagramme :**
```
[Accueil] → [Onboarding profil — chat coach IA] → [Connexion données] → [Dashboard — accès libre]
[Dashboard] ↔ [Séance/Repas du jour]
[Dashboard] ↔ [Planning semaine]
[Dashboard] → (bandeau upsell) → [Paiement abonnement] → [Dashboard — débloqué]
```

**Révision du 2026-07-26 (décision produit) :** l'onboarding est une conversation avec le coach IA (~5 min, questions ciblées) plutôt qu'un formulaire, et le paiement est proposé après un accès libre au Dashboard (coach IA mis en avant) plutôt qu'avant — objectif : attacher l'utilisateur à l'app avant de convertir.

**Écrans secondaires :** Récupération mot de passe, Facturation

## 5. Zoning Pencil

- **Outil :** Pencil
- **Fichier :** `/Users/este/.pencil/documents/b0463ce3-9203-4fdb-9912-59cb8c46d8ed/pencil-new.pen`
- **Format :** mobile (375 × 812)
- **Sections :** 3 (Funnel principal partagé, Boucle d'usage quotidien, Écrans secondaires)
- **Frames totaux :** 9

## 6. Plan d'attaque conseillé

1. **Test utilisateur du prototype zoning.** Cliquable, observe les clics, ne demande pas d'avis.
2. **Maquettes hi-fi** si zoning validé. Reprends le zoning, applique une charte graphique (logo, 2 polices, 3 couleurs).
3. **Choix techno.** No-code (Bubble, Webflow), Next.js, autre. À discuter avec un dev.
4. **Itérations persona.** Affiner avec les premiers utilisateurs réels.

Le plugin brief-to-zoning s'arrête ici. Développement, test client, marketing sortent du périmètre.

## 7. PRD prêt pour dev

---

### Feature 1 — Coach IA personnalisé (entraînement + nutrition)

#### Description
En tant que Thomas qui stagne, doute de la cohérence de son programme et gère sa nutrition à côté sans lien avec son entraînement, je veux un coach IA qui construit un plan d'entraînement ET de nutrition à partir de mon profil et de mon historique, afin de progresser avec un plan cohérent qui a vraiment du sens pour moi.

#### Critères d'acceptation
1. Given Thomas vient de créer son profil (objectif, niveau, disponibilités, historique, habitudes alimentaires)
   When il valide son profil initial
   Then le coach IA génère un premier plan personnalisé combinant entraînement et nutrition
2. Given Thomas a complété une séance ou un repas prévu par le coach IA
   When il enregistre le résultat (temps, sensations, fatigue / suivi nutrition)
   Then le coach IA ajuste automatiquement les séances et recommandations nutritionnelles suivantes
3. Given Thomas stagne depuis plusieurs semaines sur un indicateur clé
   When le coach IA détecte l'absence de progression
   Then il propose une adaptation du plan avec une explication claire

#### Écrans
- Onboarding profil
- Paiement abonnement
- Dashboard
- Séance/Repas du jour

---

### Feature 2 — Centralisation des données

#### Description
En tant que Thomas qui jongle entre Strava, son appli muscu et un carnet Excel nutrition, je veux centraliser toutes mes données sportives et nutritionnelles dans une seule application, afin d'avoir une vision globale de ma charge, ma récupération et ma progression sans naviguer entre plusieurs outils.

#### Critères d'acceptation
1. Given Thomas utilise Strava, une appli muscu et un carnet nutrition Excel
   When il connecte ses sources de données à Hybride Club (ou saisit manuellement)
   Then toutes ses données apparaissent centralisées dans un seul tableau de bord
2. Given Thomas a des données de plusieurs sports enregistrées
   When il consulte son tableau de bord
   Then il visualise sa charge d'entraînement globale, sa récupération et sa progression sans changer d'application
3. Given une nouvelle séance ou un repas est enregistré dans une app tierce connectée
   When la synchronisation se déclenche
   Then la donnée apparaît dans Hybride Club sans ressaisie manuelle

#### Écrans
- Connexion données
- Dashboard
- Séance/Repas du jour (saisie manuelle)

---

### Feature 3 — Planning selon emploi du temps

#### Description
En tant que Thomas avec un poste à responsabilité et une vie perso à gérer, je veux un planning qui s'adapte à mon emploi du temps (travail, sport, famille), afin de m'entraîner sans passer mon dimanche soir à essayer de tout caser à l'instinct.

#### Critères d'acceptation
1. Given Thomas a renseigné ses disponibilités récurrentes
   When l'application génère son planning de la semaine
   Then les séances proposées ne rentrent pas en conflit avec les créneaux indisponibles
2. Given un imprévu survient (réunion tardive, fatigue, empêchement)
   When Thomas signale l'imprévu dans l'appli
   Then le planning se réajuste automatiquement sans casser la logique de progression
3. Given Thomas consulte son planning le dimanche soir
   When il ouvre l'application
   Then il voit sa semaine organisée automatiquement, sans devoir arbitrer lui-même

#### Écrans
- Onboarding profil (dispos)
- Dashboard (aperçu)
- Planning semaine
