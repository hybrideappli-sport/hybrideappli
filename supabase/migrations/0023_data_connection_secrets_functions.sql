-- supabase/migrations/0023_data_connection_secrets_functions.sql — US-02, ADR-013 §2, ADR-010 §5
--
-- Jetons OAuth chiffrés APPLICATIVEMENT via `pgcrypto` (extension activée en `0001`), clé HORS BASE
-- (`DATA_TOKEN_ENC_KEY`, jamais stockée en Postgres — transmise en argument à chaque appel, comme
-- documenté pour `risk_flags.notes_enc`, ADR-010 §5). PostgREST/supabase-js ne peuvent pas évaluer
-- `pgp_sym_encrypt(...)` dans un payload JSON d'`insert()` : ce sont donc deux fonctions
-- `security definer`, `service_role` exclusivement, qui font transiter le chiffrement/déchiffrement
-- ENTIÈREMENT côté Postgres — aucun `bytea` ne traverse jamais la sérialisation JSON de PostgREST,
-- et le texte en clair d'un jeton ne quitte jamais ce module SQL vers un rôle non `service_role`.
--
-- `search_path` inclut `extensions` (schéma d'installation de `pgcrypto` sur ce projet, vérifié en
-- local — PAS `public`) EN PREMIER : sans cela, `pgp_sym_encrypt`/`pgp_sym_decrypt` sont introuvables
-- (`function ... does not exist`). Sans risque vis-à-vis du durcissement de `0016` (vecteur
-- `pg_temp`) : `extensions` n'accorde `CREATE` qu'à `postgres`/`dashboard_user`, jamais à
-- `anon`/`authenticated`/`service_role` (`USAGE` seul) — aucun rôle non-superuser ne peut y créer un
-- objet homonyme pour détourner la résolution.

create or replace function public.store_data_connection_secret(
  p_connection_id uuid,
  p_access_token text,
  p_refresh_token text,
  p_expires_at timestamptz,
  p_key text
) returns void
language sql
security definer
set search_path = extensions, pg_catalog, public, pg_temp
as $$
  insert into data_connection_secrets (data_connection_id, access_token_enc, refresh_token_enc, access_token_expires_at, rotated_at)
  values (p_connection_id, pgp_sym_encrypt(p_access_token, p_key), pgp_sym_encrypt(p_refresh_token, p_key), p_expires_at, now())
  on conflict (data_connection_id) do update
    set access_token_enc = excluded.access_token_enc,
        refresh_token_enc = excluded.refresh_token_enc,
        access_token_expires_at = excluded.access_token_expires_at,
        rotated_at = now();
$$;
revoke all on function public.store_data_connection_secret(uuid, text, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.store_data_connection_secret(uuid, text, text, timestamptz, text) to service_role;

create or replace function public.read_data_connection_secret(p_connection_id uuid, p_key text)
returns table(access_token text, refresh_token text, access_token_expires_at timestamptz)
language sql
security definer
set search_path = extensions, pg_catalog, public, pg_temp
as $$
  select pgp_sym_decrypt(access_token_enc, p_key), pgp_sym_decrypt(refresh_token_enc, p_key), access_token_expires_at
  from data_connection_secrets
  where data_connection_id = p_connection_id;
$$;
revoke all on function public.read_data_connection_secret(uuid, text) from public, anon, authenticated;
grant execute on function public.read_data_connection_secret(uuid, text) to service_role;
