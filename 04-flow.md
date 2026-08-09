# Flow user — Hybride Club

> Phase 4 du pipeline brief-to-zoning.
> Date : 2026-07-26
> Total écrans : 9 (max 10)

## Liste des écrans

| # | Écran | Rôle entonnoir | Features concernées |
|---|---|---|---|
| 1 | Accueil | Accueil | F1, F2, F3 |
| 2 | Onboarding profil (chat coach IA) | Sélection | F1, F3 |
| 3 | Connexion données | Validation | F2 |
| 4 | Dashboard | Finalisation (accès libre) | F1, F2, F3 |
| 5 | Paiement abonnement | Conversion (proposé depuis le dashboard) | F1, F2, F3 |
| 6 | Séance/Repas du jour | Boucle d'usage | F1, F2 |
| 7 | Planning semaine | Boucle d'usage | F3 |

## Écrans secondaires

| # | Écran | Justification |
|---|---|---|
| S1 | Récupération mot de passe | Connexion requise |
| S2 | Facturation | Paiement requis (abonnement) |

Note : l'écran "Profil utilisateur" n'est pas compté séparément — l'écran Onboarding profil sert aussi d'écran d'édition profil (état différent, pas un écran en plus).

## Diagramme du flow

```
[Accueil]
   ↓ (clic "Créer mon compte")
[Onboarding profil — chat coach IA]
   conversation guidée ~5 min, questions ciblées (objectif, niveau, dispos, historique, alimentation)
   ↓ (profil configuré)
[Connexion données]
   connecter Strava / appli muscu / nutrition, ou saisie manuelle
   ↓ (connexion ou saisie confirmée)
[Dashboard — accès libre]
   Coach IA (plan du jour) en premier, données centralisées et aperçu semaine ensuite, bandeau upsell abonnement
   ↓ (clic "Séance/Repas du jour")   ↓ (clic "Planning semaine")   ↓ (clic bandeau upsell)
[Séance/Repas du jour]              [Planning semaine]             [Paiement abonnement]
   ↓ (enregistrement)                  ↓ (imprévu signalé)            ↓ (paiement OK)
[Dashboard]                         [Dashboard]                    [Dashboard — débloqué]

Écrans secondaires :
[Récupération mot de passe] ← accessible depuis [Accueil]
[Facturation] ← accessible depuis [Dashboard] (une fois abonné)
```

## États par écran clé

### Onboarding profil (chat coach IA)

- État par défaut : conversation guidée par le coach IA, questions ciblées une à la fois (objectif, niveau, dispos, historique, habitudes alimentaires), durée indicative ~5 min affichée
- État chargement : le coach « écrit » sa réponse / calcule la question suivante
- État vide : —
- État erreur : réponse utilisateur incompréhensible, le coach reformule sa question
- État succès : conversation terminée, profil configuré, redirection vers Connexion données

### Connexion données

- État par défaut : liste des sources disponibles (Strava, appli muscu, nutrition) + option saisie manuelle
- État chargement : synchronisation en cours avec une source connectée
- État vide : aucune source connectée, saisie manuelle affichée par défaut
- État erreur : échec de connexion à une source (token expiré, API indisponible)
- État succès : source(s) connectée(s) ou saisie manuelle validée

### Paiement abonnement

- État par défaut : offre(s) d'abonnement, formulaire de paiement — accessible depuis le bandeau upsell du dashboard, pas dans le funnel initial
- État chargement : traitement du paiement
- État vide : —
- État erreur : paiement refusé
- État succès : abonnement actif, retour au Dashboard désormais débloqué

### Dashboard

- État par défaut (accès libre) : Coach IA (plan du jour) affiché en premier et mis en avant visuellement, données centralisées et aperçu de la semaine ensuite, bandeau upsell abonnement en bas de page
- État chargement : récupération des données au chargement
- État vide : premier accès, plan tout juste généré par le coach, aucune séance encore enregistrée
- État erreur : échec de synchronisation d'une source de données
- État succès (débloqué) : abonnement actif, bandeau upsell disparaît, fonctionnalités complètes du coach IA accessibles

### Séance/Repas du jour

- État par défaut : séance ou repas prévu par le coach IA à enregistrer
- État chargement : envoi de l'enregistrement, recalcul du plan
- État vide : rien de prévu ce jour (jour de repos)
- État erreur : échec d'enregistrement
- État succès : séance/repas enregistré, plan ajusté si besoin

### Planning semaine

- État par défaut : semaine générée selon les disponibilités renseignées
- État chargement : réajustement du planning après signalement d'un imprévu
- État vide : disponibilités non renseignées, planning non généré
- État erreur : conflit non résolu entre créneaux
- État succès : planning réajusté sans casser la logique de progression

## Mapping feature → écrans

- **Feature 1 — Coach IA** : Onboarding profil, Paiement abonnement, Dashboard, Séance/Repas du jour
- **Feature 2 — Centralisation des données** : Connexion données, Dashboard, Séance/Repas du jour (saisie manuelle)
- **Feature 3 — Planning adaptatif** : Onboarding profil (dispos), Dashboard (aperçu), Planning semaine

## Notes

Les 3 features partagent le même entonnoir (Accueil → Onboarding → Connexion données → Dashboard → Paiement) plutôt que 3 entonnoirs séparés, car un seul abonnement débloque les 3 features ensemble. L'écran Profil utilisateur a été fusionné avec Onboarding profil pour respecter la limite de 10 écrans.

**Révision du 2026-07-26 :** décision produit du fondateur — deux changements volontaires par rapport à la version initiale.
1. **Onboarding profil** devient une conversation avec le coach IA (~5 min, questions ciblées) plutôt qu'un formulaire à 5 champs, pour rester cohérent avec la promesse « coach IA » dès le premier contact.
2. **Paiement abonnement** est retiré du funnel initial et repositionné après le Dashboard (accès libre) : l'utilisateur découvre et s'attache à l'app (coach IA en avant) avant qu'on lui propose l'abonnement, via un bandeau upsell dans le Dashboard. Objectif : augmenter l'attachement avant la conversion plutôt que de payer avant d'avoir vu de la valeur.

**Révision du 2026-08-06 :** ce funnel décrit la cible une fois les 3 features construites. Pour la V1 (Feature 1 seule, Feature 2 pas encore construite), l'étape **Connexion données est retirée du funnel** — elle n'a pas de sens sans la Feature 2 (aucune source à connecter, aucune saisie manuelle alternative à proposer puisque F1 fonctionne nativement en régime déclaratif, voir AC12 de `07-spec-feature1-coach-ia.md`). Le funnel V1 est donc : `Accueil → Onboarding profil (chat) → Dashboard (accès libre) → Paiement abonnement (depuis le bandeau upsell)`. L'étape Connexion données reprend sa place dans le funnel dès que la Feature 2 est cadrée et construite.
