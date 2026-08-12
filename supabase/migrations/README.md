# Migrations — convention de numérotation

Séquentielle, 4 chiffres (`NNNN_slug.sql`), sans trou. Avant de créer une nouvelle migration : `ls supabase/migrations/` pour trouver le prochain numéro libre — ne pas se fier à ce fichier seul s'il n'a pas été mis à jour récemment, il est là en appoint pour une coordination entre sessions concurrentes sur ce repo.

## Numéros réservés / en cours

- ~~`0015` — `club_app_enrolled`~~ — committé (`b1b88aa`, branche `feature/design-system-hybride`), l'historique git fait foi.
- ~~`0016` — `security_definer_search_path_hardening`~~ — committé (`54bb61c`, même branche).
- **`0017`** — `app_enrolled_from_signup_metadata` — pris le 2026-08-12, même session que 0015/0016. Corrige le point d'écriture de `profiles.app_enrolled` (dérivé par `handle_new_user()` depuis `raw_user_meta_data`, pas inséré par le site).

Retirer une ligne de cette liste une fois la migration correspondante committée (l'historique git devient alors la source de vérité, ce fichier n'a plus besoin de la porter). Note : au 2026-08-12, ce repo est checkouté sur `feature/design-system-hybride`, pas `main` — vérifier la branche courante avant de considérer une entrée "définitivement committée".
