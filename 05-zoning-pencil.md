# Zoning Pencil — Hybride Club

## Lien

- Outil : Pencil
- Fichier : `/Users/este/.pencil/documents/b0463ce3-9203-4fdb-9912-59cb8c46d8ed/pencil-new.pen`
- Format : mobile (375 × 812)
- Créé/modifié le : 2026-07-26

## Organisation

Les 3 features MVP partagent le même entonnoir (un seul abonnement débloque les 3 features), donc le zoning est organisé en 3 sections sur le canvas plutôt qu'en 3 pages étanches par feature :

### Section 1 — Funnel principal (partagé)

Écrans :
- 1 — Accueil : hero, titre, UVP, bouton principal « Créer mon compte », bouton secondaire « J'ai déjà un compte »
- 2 — Onboarding profil (chat coach IA) : conversation guidée ~5 min, bulles coach/utilisateur, questions ciblées une à la fois (objectif, niveau, dispos, historique, alimentation), champ de réponse en bas
- 3 — Connexion données : cartes source (Strava, Appli muscu, Nutrition) avec bouton « Connecter », bouton secondaire « Saisir manuellement », bouton principal « Continuer »
- 4 — Dashboard (accès libre) : Coach IA — plan du jour en premier et mis en avant (bordure accent), carte données centralisées, aperçu planning semaine, bandeau upsell « débloquer l'abonnement complet » en bas, nav vers Séance/Repas du jour et Planning semaine
- 5 — Paiement abonnement : carte offre, champs numéro de carte / date-CVC, bouton principal « Payer et activer mon abonnement » — accessible depuis le bandeau upsell du Dashboard, pas avant

Connecteurs (simulés en labels texte sur le canvas) : Accueil → créer un compte → Onboarding profil (chat) → profil configuré → Connexion données → données connectées → Dashboard (libre) → débloquer l'abonnement (depuis le dashboard) → Paiement abonnement → retour au Dashboard débloqué.

**Révision du 2026-07-26** : le paiement a été déplacé après le Dashboard (décision produit — laisser l'utilisateur s'attacher à l'app et au coach IA avant de proposer l'abonnement) et l'onboarding est passé d'un formulaire à une conversation avec le coach IA.

### Section 2 — Boucle d'usage quotidien

Écrans :
- 6 — Séance/Repas du jour : illustration, détail de la séance/repas prévu, champs sensations-fatigue / résultat, bouton principal « Enregistrer »
- 7 — Planning semaine : 7 lignes jour (Lun→Dim) avec séance prévue, bouton secondaire « Signaler un imprévu »

Connecteurs : Dashboard ↔ Séance/Repas du jour (aller/retour après enregistrement), Dashboard ↔ Planning semaine (aller/retour).

### Section 3 — Écrans secondaires

Écrans :
- S1 — Récupération mot de passe : titre, champ email, bouton principal « Envoyer le lien » — accessible depuis Accueil
- S2 — Facturation : 3 lignes facture (date, montant, statut) — accessible depuis Dashboard

## Mapping feature → écrans (rappel de 04-flow.md)

- **Feature 1 — Coach IA** : Onboarding profil, Paiement abonnement, Dashboard, Séance/Repas du jour
- **Feature 2 — Centralisation des données** : Connexion données, Dashboard, Séance/Repas du jour (saisie manuelle)
- **Feature 3 — Planning adaptatif** : Onboarding profil (dispos), Dashboard (aperçu), Planning semaine

## Symboles utilisés

Convention 6 symboles respectée : visuels (rectangle gris + label « Image »), boutons principaux (fond orange #FB923C), boutons secondaires (contour), champs (contour + label « Champ : … »), composants réutilisables (contour + label « Composant : … »), fond/décor (headers gris clair).

Pas de couleur de marque définitive, pas de typo finale — zoning volontairement pauvre visuellement.
