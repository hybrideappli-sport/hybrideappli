-- Taux de recueil post-séance — mesure de RÉFÉRENCE avant bascule en conversation.
--
-- Pourquoi ce fichier. Le chantier « recueil post-séance conversationnel » remplace le
-- formulaire de `/aujourdhui` par une relance du coach. Son but déclaré est de fermer un trou
-- précis : aujourd'hui, ne rien saisir équivaut à dire que tout va bien, et la charge continue
-- de monter (`hasActiveNegativeSignal()` ne trouve rien, donc aucune baisse et surtout aucun
-- blocage de hausse). Sans chiffre AVANT, on ne saura pas si le chat a gagné.
--
-- À exécuter sur la PRODUCTION (`hybrideclub`) avant la bascule, puis à intervalle régulier
-- après. Le jeu local ne contient que des données de test et rendra des taux vides.
--
-- Les quatre taux :
--   pct_saisie          — une séance passée a-t-elle laissé une trace ? C'est le trou visé.
--   pct_avec_rpe        — ces deux-là déclenchent la baisse de 20 % (`rpe >= 8`,
--   pct_avec_freshness    `freshness <= 2`), avec `pain <> 'none'`. Un log sans eux est valide
--                         mais INERTE : il n'ajustera jamais rien.
--   pct_signal_negatif  — la mesure de sortie : à quelle fréquence le recueil déplace-t-il
--                         réellement le plan ? C'est le seul taux qui parle d'effet, pas de
--                         remplissage.
--
-- Un cinquième taux n'existera qu'après la bascule : la part de conversations abandonnées avant
-- d'avoir obtenu `completion` + `pain`. L'écriture précoce (décision du 2026-09-25) est censée
-- la rendre indolore — un abandon laisse un log partiel mais valide, jamais rien.
--
-- Exclusions assumées :
--   - séances de repos : rien à recueillir ;
--   - `excluded_at is not null` : logs supersédés par la réconciliation Strava (ADR-015), les
--     compter ferait apparaître deux traces pour une seule séance ;
--   - `completion = 'not_done'` pour les taux rpe/freshness : une séance non faite n'a
--     légitimement ni difficulté ni fraîcheur à déclarer.
--
-- Vérifié le 2026-09-25 sur jeu synthétique (10 séances, 6 loggées, 4 exploitables) :
--   saisie 60 % · rpe 75 % · freshness 50 % · signal négatif 75 %.

with seances as (
  select ps.id
  from planned_sessions ps
  where ps.scheduled_date < current_date
    and ps.scheduled_date >= current_date - interval '90 days'
    and ps.session_type <> 'rest'
),
logs as (
  select * from session_logs where excluded_at is null
),
appariees as (
  select s.id as session_id, l.id as log_id, l.rpe, l.freshness, l.pain, l.completion
  from seances s
  left join logs l on l.planned_session_id = s.id
),
effectives as (
  select * from appariees where completion in ('done', 'partial')
)
select
  (select count(*) from seances)                                              as seances_passees,
  (select count(*) from appariees where log_id is not null)                   as seances_avec_log,
  round(100.0 * (select count(*) from appariees where log_id is not null)
              / nullif((select count(*) from seances), 0), 1)                 as pct_saisie,
  round(100.0 * (select count(*) from effectives where rpe is not null)
              / nullif((select count(*) from effectives), 0), 1)              as pct_avec_rpe,
  round(100.0 * (select count(*) from effectives where freshness is not null)
              / nullif((select count(*) from effectives), 0), 1)              as pct_avec_freshness,
  round(100.0 * (select count(*) from effectives
                 where (rpe >= 8 or freshness <= 2 or pain <> 'none'))
              / nullif((select count(*) from effectives), 0), 1)              as pct_signal_negatif;
