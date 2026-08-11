# ADR-001 — Plateforme cliente : PWA mobile-first + architecture API-first

- **Statut** : Accepté (hypothèse explicite, réversible)
- **Date** : 2026-08-04
- **Décideur** : `architect`
- **Portée** : Projet (Hybride Club)
- **Feature déclenchante** : US-01 — Coach IA personnalisé

---

## Contexte

Aucun document produit (`01-brief.md` → `07-spec-feature1-coach-ia.md`) ne tranche entre application native et web mobile. Les éléments disponibles :

- le zoning et les maquettes hi-fi sont au format mobile 375 × 812 (`05-zoning-pencil.md`) ;
- la Feature 1 ne requiert **aucune capacité native** : pas de capteur, pas de Bluetooth, pas de GPS, pas de HealthKit — le régime froid est 100 % déclaratif (AC12) ;
- la Feature 1 requiert une **notification "ta semaine est prête"** le dimanche soir (AC5) ;
- la **Feature 2** (hors périmètre, à venir) impliquera Strava (OAuth web, sans problème) mais potentiellement Apple Health / Google Fit / montres, qui exigent un conteneur natif ;
- le produit est un SaaS BtoC par abonnement, en phase de lancement, avec une équipe très réduite : le time-to-market prime.

## Décision

1. **V1 = application web Next.js 16 mobile-first, installable en PWA.** Pas d'application native au lancement de la Feature 1.
2. **L'architecture est API-first** : toute opération métier passe par des **Route Handlers versionnés** sous `/app/api/v1/...`, avec des contrats typés partagés (`@hybride/domain`, Zod). Aucune logique métier n'est enfermée dans des Server Actions non réutilisables.
3. Les Server Actions sont réservées aux mutations strictement locales à l'UI web (préférences d'affichage, acquittements triviaux).
4. Un client natif **Expo / React Native** pourra être ajouté ultérieurement (probablement au moment de la Feature 2) en consommant la même API v1, sans réécriture du back-end.

## Conséquences

**Positives**

- Time-to-market minimal, un seul déploiement (Vercel), pas de cycle de review App Store pendant la phase d'itération produit rapide.
- Le paywall n'est pas soumis aux commissions de 15-30 % des stores : Stripe en direct est possible (voir ADR-009). C'est un impact business direct sur un produit dont le prix n'est pas encore fixé.
- Le passage ultérieur au natif est un ajout de client, pas une refonte.

**Négatives / à surveiller**

- **Notifications push sur iOS** : le Web Push n'est disponible que pour une PWA **installée sur l'écran d'accueil** (iOS 16.4+). La notification hebdomadaire de l'AC5 n'est donc pas garantie pour tous les utilisateurs iOS.
  → **Mitigation** : canal double dès la V1 — Web Push quand disponible, **e-mail (Brevo) en repli systématique**, et badge persistant "révision de la semaine à consulter" dans le Dashboard. La table `notifications` porte une colonne `channel` pour tracer le canal effectif.
- Prompt d'installation PWA à intégrer dans le parcours (après le premier plan généré, pas avant : cohérent avec la stratégie "attachement avant conversion").
- Feature 2 devra rouvrir cette décision si l'intégration Apple Health devient nécessaire.

## Alternatives écartées

| Alternative | Raison du rejet |
|---|---|
| Expo / React Native dès la V1 | Coût d'infrastructure (builds, stores, OTA) et de delivery non justifié pour une feature sans besoin natif ; commissions store sur l'abonnement ; ralentit l'itération produit en phase de lancement. |
| Next.js web "classique" non installable | Perd le Web Push et l'ancrage sur l'écran d'accueil, essentiels pour un produit à boucle d'usage quotidienne. |
| No-code (Bubble), évoqué dans `06-recap.md` §6 | Incompatible avec la contrainte d'auditabilité : le moteur à règles doit être un artefact de code testable, versionné et rejouable (ADR-002). |

## Hypothèse à valider auprès du fondateur

> La V1 est distribuée en web/PWA et non sur les stores. Si une présence store est une exigence marketing de lancement non négociable, cet ADR doit être rouvert **avant** le démarrage de l'implémentation.
