# Migrations — convention de numérotation

Séquentielle, 4 chiffres (`NNNN_slug.sql`), sans trou. Avant de créer une nouvelle migration : `ls supabase/migrations/` pour trouver le prochain numéro libre — ne pas se fier à ce fichier seul s'il n'a pas été mis à jour récemment, il est là en appoint pour une coordination entre sessions concurrentes sur ce repo.

## Numéros réservés / en cours

- **`0015`** — `club_app_enrolled` — pris le 2026-08-12, session travaillant sur le site club (`hybride-page`). Colonne additive `profiles.app_enrolled`, corrige une fuite de finalité RGPD dans `enqueueWeeklyReviews`. Voir le fichier de migration pour le détail.

Retirer une ligne de cette liste une fois la migration correspondante committée sur `main` (l'historique git devient alors la source de vérité, ce fichier n'a plus besoin de la porter).
