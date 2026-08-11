-- supabase/migrations/0013_billing_robustness.sql
-- Corrections issues de la revue de fin de projet (`reviews/US-01-coach-ia-personnalise-review.md`),
-- findings I2 et I3.

-- ============================================================================================
-- I2 — `isStaleForSubscription()` (apps/web/app/api/v1/webhooks/stripe/route.ts) relisait les 50
-- derniers `stripe_events` TOUS ABONNEMENTS CONFONDUS pour retrouver le dernier événement connu
-- d'UN abonnement donné. Avec quelques dizaines d'utilisateurs actifs, l'événement précédent d'un
-- abonnement sort de cette fenêtre en quelques heures : la fonction répondait alors `false` (« pas
-- obsolète ») et un événement livré hors ordre (webhook rejoué, retard réseau) pouvait écraser un
-- état plus récent — pas seulement un souci de volumétrie, une faille de correction dès la
-- première dizaine d'utilisateurs. `last_event_created` porte désormais, PAR ABONNEMENT,
-- `event.created` du dernier événement Stripe effectivement appliqué : la comparaison devient une
-- lecture indexée d'une seule ligne, correcte quel que soit le nombre d'abonnements ou
-- d'événements cumulés.
-- ============================================================================================
alter table subscriptions add column last_event_created timestamptz;

-- ============================================================================================
-- I3 — `stripe_events.payload` (payloads Stripe bruts, dont l'e-mail de facturation) n'a pas de
-- `user_id` et n'est pas couvert par `erase_account()` (5.3, question ouverte n°9) : aucun job de
-- purge n'existait, la table grossissait indéfiniment. Rétention tranchée à 60 jours — largement
-- au-delà des quelques semaines nécessaires à l'idempotence webhook (`08-architecture.md` §5.3) et
-- de la fenêtre de nouvelle tentative de Stripe (3 jours maximum), avec une marge confortable pour
-- le support/débogage d'un incident de facturation récent. Le job (`POST
-- /api/v1/cron/purge-stripe-events`, cron quotidien) est ajouté côté application ; cette fonction
-- porte la RÈGLE (quelle rétention, quel filtre) en base, pour rester la source de vérité unique
-- et testable indépendamment du cron qui l'appelle.
-- ============================================================================================
create or replace function public.purge_stale_stripe_events(p_retention_days int default 60)
returns int
language sql
security definer
set search_path = public
as $$
  with deleted as (
    delete from stripe_events
    where event_created < (now() - make_interval(days => p_retention_days))
    returning id
  )
  select count(*)::int from deleted;
$$;
revoke all on function public.purge_stale_stripe_events(int) from public, anon, authenticated;
grant execute on function public.purge_stale_stripe_events(int) to service_role;
