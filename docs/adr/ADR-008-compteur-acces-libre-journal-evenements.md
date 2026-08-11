# ADR-008 — Compteur d'accès libre : journal d'événements + fenêtre calculée

- **Statut** : Accepté
- **Date** : 2026-08-04
- **Décideur** : `architect`
- **Portée** : Feature 1 (structurant pour la monétisation des 3 features)
- **Feature déclenchante** : US-01, AC13 — et question ouverte n°5 de la fiche

---

## Contexte

L'AC13 pose la frontière de monétisation : **3 accès par semaine** au plan du jour et son explication courte en accès libre ; au-delà, ou pour la vue semaine / la vue macro / les ajustements automatiques illimités, redirection vers l'écran Paiement.

Deux ambiguïtés produit subsistent, l'une explicitement listée en question ouverte :

1. **Fenêtre** : réinitialisation à jour fixe (lundi) ou glissante sur 7 jours ? — question ouverte n°5 de la fiche.
2. **Unité d'accès** : qu'est-ce qui compte pour 1 accès ? Un chargement d'écran ? Une session ? Une journée ?

Ces deux points ne sont pas tranchés, et ils ne relèvent pas de l'architecte. Mais l'implémentation ne peut pas attendre. Par ailleurs, un compteur incrémental (`accesses_used int`) rend tout changement de règle rétroactivement impossible et toute analyse impossible.

## Décision

**Ne pas stocker un compteur. Stocker un journal d'événements et calculer la fenêtre.**

### 1. `free_access_events` — journal append-only

```sql
free_access_events (
  id uuid primary key,
  user_id uuid not null,
  accessed_on date not null,          -- date locale de l'utilisateur
  first_accessed_at timestamptz not null,
  surface text not null,              -- 'dashboard' | 'today'
  unique (user_id, accessed_on)       -- ← l'unité d'accès est le JOUR
)
```

### 2. Unité d'accès retenue : **la journée calendaire**

Un utilisateur qui consulte son plan du jour consomme **1 accès pour la journée**, quel que soit le nombre de fois qu'il ouvre le Dashboard ou l'écran Séance/Repas du jour ce jour-là. Garanti par la contrainte d'unicité `(user_id, accessed_on)` — pas par du code applicatif.

Justification : compter les chargements d'écran rendrait le quota inutilisable (le flow `04-flow.md` fait aller-retour Dashboard ↔ Séance du jour à chaque enregistrement, ce qui brûlerait le quota en une session), produirait une frustration punitive contraire à la stratégie « attachement avant conversion », et serait perçu comme déloyal. « 3 accès par semaine » signifie donc **3 jours d'usage par semaine** — ce qui est aussi la lecture la plus naturelle pour l'utilisateur.

### 3. Fenêtre : stratégie paramétrable, défaut `fixed_week`

La fenêtre n'est **pas** figée dans le schéma. Elle est un paramètre du ruleset (`params.free_access.window_strategy`, ADR-007) avec deux valeurs supportées :

| Stratégie | Fenêtre | Défaut |
|---|---|---|
| `fixed_week` | lundi 00:00 → dimanche 23:59, fuseau de l'utilisateur | ✅ |
| `rolling_7d` | 7 jours glissants avant l'instant courant | |

Une seule fonction pure calcule le droit d'accès :

```ts
evaluateFreeAccess(events: FreeAccessEvent[], now: ZonedDateTime, params): {
  allowed: boolean; used: number; remaining: number;
  periodStart: string; periodEnd: string; resetsAt: string;
}
```

**Les deux stratégies se calculent à partir du même journal d'événements.** Changer d'avis après le lancement est donc un changement de paramètre, sans migration, sans perte d'historique, et sans rupture pour les utilisateurs existants.

Défaut `fixed_week` retenu par lisibilité produit : « il te reste 2 accès jusqu'à dimanche » est compréhensible ; une fenêtre glissante produit un droit d'accès qui réapparaît à des moments imprévisibles pour l'utilisateur.

### 4. Le quota n'est jamais évalué côté client

Le décompte est écrit par le **serveur**, dans le Route Handler qui sert le plan du jour, avant renvoi de la réponse. L'API ne renvoie jamais les données au-delà du droit : un utilisateur libre reçoit strictement la séance du jour et son `short_text`, jamais la semaine (ADR-004 §« le paywall se traduit par une contrainte de requête »). L'UI ne fait qu'*afficher* un état qu'elle ne peut pas contourner.

### 5. Ce qui n'est jamais bloqué

Ne consomment pas d'accès et restent accessibles hors quota :

- la **saisie** post-séance/repas (`POST /session-logs`, `/nutrition-checkins`) — bloquer la saisie appauvrirait les données du moteur et se retournerait contre la qualité du produit ;
- les **écrans de sécurité** : protocole douleur niveau 2 et 3, orientation vers un professionnel de santé (AC9), disclaimer, retrait de consentement. Un message de sécurité derrière un paywall serait une faute éthique et juridique ;
- l'écran de paiement, la facturation, le compte.

### 6. Levée immédiate à l'abonnement

L'AC13 exige que « toutes ces limitations disparaissent immédiatement » une fois abonné. Le droit d'accès est dérivé de `subscriptions.status` (source de vérité : webhooks Stripe, ADR-009). L'endpoint `GET /api/v1/entitlements` est la seule source d'autorité, sans cache long côté client (`no-store`), pour éviter tout décalage après paiement.

## Conséquences

**Positives**

- La question ouverte n°5 de la fiche ne bloque plus l'implémentation, et pourra être tranchée — voire modifiée après le lancement — sans dette.
- Le journal est directement exploitable en analytics produit (fréquence d'usage libre, corrélation accès/conversion), ce qui alimentera la décision de prix (elle-même non tranchée).
- Le quota est inviolable côté client par construction.

**Négatives / à surveiller**

- Le fuseau horaire de l'utilisateur devient une donnée critique (`profiles.timezone`), y compris pour la révision hebdomadaire du dimanche soir (ADR-011). Défaut `Europe/Paris`.
- Écrire un événement d'accès dans un chemin de lecture rend ce chemin non purement cacheable : le handler du plan du jour doit être `dynamic` et non mis en cache CDN.
- Contournement possible par création de plusieurs comptes : accepté en V1 (coût du contournement > valeur pour l'utilisateur), à surveiller.

## Alternatives écartées

| Alternative | Raison du rejet |
|---|---|
| Compteur incrémental `profiles.free_accesses_used` + reset cron | Aucun historique, changement de stratégie impossible rétroactivement, tâche de reset supplémentaire à opérer et à surveiller, et perte totale de données analytiques. |
| Comptage par chargement d'écran | Brûle le quota en une session à cause des allers-retours du flow ; perçu comme punitif, contraire à `04-flow.md`. |
| Quota géré côté client (localStorage) | Trivialement contournable. |
| Attendre la décision produit sur la fenêtre | Bloque l'implémentation sur une question dont l'impact technique est nul dès lors qu'on journalise. |

## Question ouverte relayée au fondateur

> 1. Confirmer que « 3 accès par semaine » signifie bien **3 journées d'usage**, et non 3 ouvertures d'écran.
> 2. Trancher `fixed_week` (défaut retenu) vs `rolling_7d`.
> 3. Le prix de l'abonnement n'est pas fixé (les maquettes affichent **19 €/mois à titre de placeholder**) : aucune valeur n'est codée en dur, le tarif provient de Stripe (`STRIPE_PRICE_ID_MONTHLY`).
