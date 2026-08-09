# ADR-009 — Abonnement Stripe via Payment Element embarqué, webhooks source de vérité

- **Statut** : Accepté
- **Date** : 2026-08-04
- **Décideur** : `architect`
- **Portée** : Projet (monétisation des 3 features MVP)
- **Dépend de** : ADR-001, ADR-008
- **Feature déclenchante** : US-01, AC13

---

## Contexte

Le modèle économique est un SaaS BtoC par abonnement mensuel, un seul abonnement débloquant les 3 features MVP (`05-zoning-pencil.md`). Le zoning et les maquettes hi-fi de l'écran Paiement montrent un **formulaire de carte embarqué** dans l'application (champs « numéro de carte », « date / CVC », bouton « Payer et activer mon abonnement »), et non une redirection vers une page hébergée.

**Le prix n'est pas fixé** : les maquettes affichent 19 €/mois, valeur explicitement posée par `designer` comme placeholder. Aucun document produit ne définit de tarif.

L'ADR-001 (distribution web/PWA, hors stores) rend l'encaissement direct par Stripe possible sans commission de plateforme.

## Décision

### 1. Stripe Billing, `Payment Element` embarqué

Flux retenu (documentation Stripe « build subscriptions », intégration Elements + PaymentIntents) :

1. `POST /api/v1/billing/subscription-intent` (serveur) :
   - crée ou récupère le `Customer` Stripe (`subscriptions.stripe_customer_id`), en ne transmettant que l'e-mail — **aucune donnée de santé, aucune donnée d'entraînement** ;
   - crée la `Subscription` avec `payment_behavior: 'default_incomplete'`, `payment_settings.save_default_payment_method: 'on_subscription'`, `expand: ['latest_invoice.confirmation_secret']` ;
   - renvoie `latest_invoice.confirmation_secret.client_secret` au client.
2. Le client monte le `Payment Element` avec ce `clientSecret` et appelle `stripe.confirmPayment({ elements, confirmParams: { return_url } })`.
3. **L'accès n'est jamais débloqué par le retour navigateur.** Il l'est par les webhooks.

Le Payment Element est rendu dans une iframe Stripe : les données de carte ne transitent jamais par nos serveurs (éligibilité **PCI-DSS SAQ A**), tout en respectant la maquette embarquée. 3D Secure / SCA est géré nativement par Stripe.

### 2. Les webhooks sont la seule source de vérité de l'accès

`POST /api/v1/webhooks/stripe` (Route Handler, `runtime = 'nodejs'`, **lecture du corps brut**, vérification de signature `STRIPE_WEBHOOK_SECRET`).

Événements traités :

| Événement | Effet |
|---|---|
| `customer.subscription.created` | crée/actualise `subscriptions`, `tier` selon `status` |
| `customer.subscription.updated` | met à jour `status`, `current_period_end`, `cancel_at_period_end` |
| `customer.subscription.deleted` | `tier = 'free'`, retour au quota d'accès libre |
| `invoice.paid` | confirme la période payée, débloque l'accès |
| `invoice.payment_failed` | `status = 'past_due'`, relance e-mail (Brevo) |

**Idempotence** : table `stripe_events` avec l'`id` d'événement Stripe en clé primaire ; un événement déjà présent est acquitté sans retraitement. Stripe ne garantit ni l'unicité ni l'ordre de livraison — l'ordre est géré en ne persistant que si `event.created` est postérieur au dernier événement traité pour cet abonnement.

### 3. Aucun prix, aucun montant en dur dans le code

- L'identifiant de tarif vient de l'environnement : `STRIPE_PRICE_ID_MONTHLY`.
- L'écran Paiement **récupère le prix depuis l'API** (`GET /api/v1/billing/offer`, qui lit le `Price` Stripe) et l'affiche formaté. Aucun « 19 € » n'est écrit dans un composant.
- Conséquence : le fondateur peut fixer et modifier le tarif sans déploiement, et le placeholder de la maquette ne peut pas fuiter en production.

### 4. Facturation

L'écran secondaire S2 (Facturation, `04-flow.md`) est servi par `GET /api/v1/billing/invoices`, qui liste les factures Stripe du customer (date, montant, statut, `hosted_invoice_url`). Aucune donnée de facturation n'est dupliquée en base au-delà de ce qui est nécessaire à l'entitlement.

### 5. Environnements

`sk_test_*` en développement et en preview, `sk_live_*` uniquement en production via les Environment Variables Vercel. Webhook endpoint distinct par environnement. Aucun secret en clair dans le repo.

## Conséquences

**Positives**

- Fidélité à la maquette sans supporter de données de carte (SAQ A).
- L'entitlement est fiable même si l'utilisateur ferme son navigateur pendant la redirection 3DS.
- Le tarif est une donnée d'exploitation, pas une donnée de code : la question ouverte sur le prix ne bloque ni le design, ni le développement, ni la mise en production.
- Portefeuilles (Apple Pay / Google Pay) activables ultérieurement par configuration du Payment Element, sans changement de code.

**Négatives / à surveiller**

- Plus de travail côté client que Stripe Checkout hébergé (montage d'Elements, gestion des états d'erreur « paiement refusé » de `04-flow.md`, `return_url`).
- Le webhook doit être robuste et rejouable : c'est le composant dont la panne est la plus visible commercialement. Supervision et alerte dédiées (à cadrer avec `devops`).
- Le test E2E de paiement nécessite la CLI Stripe (`stripe listen`) ou des fixtures de webhook en environnement de test.
- TVA / facturation européenne : Stripe Tax non activé en V1 — à trancher avec le fondateur avant mise en production commerciale.

## Alternatives écartées

| Alternative | Raison du rejet |
|---|---|
| Stripe Checkout (page hébergée) | Plus rapide à intégrer, mais contredit la maquette embarquée validée et fait sortir l'utilisateur de la PWA au moment le plus sensible du funnel (conversion post-attachement). Reste le repli si le délai de livraison devient critique. |
| Achats in-app (App Store / Play) | Sans objet en V1 (ADR-001, distribution web) ; 15-30 % de commission sur un prix non encore fixé. |
| Paddle / Lemon Squeezy (merchant of record) | Simplifie la TVA mais impose leur tunnel de paiement, coût variable supérieur, et l'écosystème Stripe est déjà la référence de la stack agence. À reconsidérer si la conformité TVA internationale devient prioritaire. |
| Déblocage de l'accès sur le retour client (`return_url`) | Non fiable et contournable ; contredit l'exigence d'un entitlement serveur (ADR-008 §4). |

## Question ouverte relayée au fondateur

> **Le prix de l'abonnement n'est pas défini.** Les maquettes affichent 19 €/mois à titre de placeholder — cette valeur n'engage rien et n'apparaît nulle part dans le code. Il faut trancher : montant, périodicité (mensuel seul ou mensuel + annuel), période d'essai éventuelle, et politique de TVA, avant l'ouverture commerciale.
