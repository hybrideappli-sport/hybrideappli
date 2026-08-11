-- supabase/migrations/0014_health_data_processing_consent_v1_1_0.sql
-- Nouvelle version du document de consentement `health_data_processing` (1.0.0 -> 1.1.0).
--
-- Contexte. Le commit 576bbf2 (fix(US-01): interaction B1 x B6) a changé le comportement du
-- retrait de ce consentement (`POST /api/v1/consents/:code/revoke`,
-- apps/web/lib/orchestration/purge-health-data-on-revoke.ts) : les `risk_flags` de type
-- 'pathology'/'minor' ne sont plus purgés (pour continuer d'afficher l'avertissement médical fixe,
-- AC3) -- seuls 'pregnancy'/'eating_disorder_history'/'other' le sont toujours. La version 1.0.0
-- de ce document (0010_seed_referentials.sql) promettait pourtant sans réserve : « Le retrait
-- entraîne la purge de ces données » -- devenu inexact pour ces deux types de drapeaux.
--
-- Décision produit : amender le texte, pas le comportement. Les indicateurs de sécurité
-- (pathologie déclarée, statut mineur) doivent survivre au retrait de CE consentement -- seul le
-- droit à l'effacement complet du compte (`erase_account()`, art. 17 RGPD, ADR-010 §8) reste total
-- et inconditionnel.
--
-- Forme : suit scrupuleusement le pattern déjà en place (ADR-010 §1/§9, docs/db-schema.md §9.3).
-- `consent_documents` est un registre immuable, jamais réécrit : une ligne déjà publiée n'est
-- jamais modifiée, une nouvelle version est insérée à côté. Le contenu reste « Contenu provisoire
-- -- à faire valider juridiquement avant mise en production » (aucune validation juridique n'a eu
-- lieu depuis la migration 0010) : cette nouvelle version est donc, comme 1.0.0 avant elle,
-- insérée avec `is_current = false` -- son activation n'est PAS le fait de cette migration
-- (rejouée sur tous les environnements, y compris en production), mais reste un acte relatif à
-- l'environnement. `supabase/seed.sql` est mis à jour dans le même correctif pour basculer
-- spécifiquement `health_data_processing` sur cette version 1.1.0 hors production ; les 3 autres
-- documents restent sur 1.0.0. En production, aucun des deux n'est `is_current` tant que la
-- migration d'activation juridique (question ouverte n°10, 08-architecture.md §12) n'a pas été
-- publiée -- ce correctif ne change rien à ce verrou.
--
-- Impact sur les consentements déjà enregistrés : aucun re-consentement forcé. `has_active_consent()`
-- (0001_extensions_enums_helpers.sql) teste uniquement `document_code`, jamais `document_version`
-- -- choix déjà documenté et assumé dans le commentaire de cette fonction (« La bascule vers une
-- nouvelle version de document ne périme volontairement PAS le consentement en cours, le
-- re-consentement est un parcours produit »). Un utilisateur ayant consenti à 1.0.0 garde donc un
-- consentement actif après ce changement, ce qui est cohérent ici : le comportement système décrit
-- par 1.1.0 (conservation des indicateurs de sécurité) s'appliquait déjà, y compris à lui, depuis
-- 576bbf2 -- ce nouveau texte rend visible un comportement déjà en vigueur, il n'introduit aucun
-- nouveau traitement qui exigerait un consentement renouvelé.

insert into consent_documents (code, version, locale, title, body_md, checksum, is_current) values
(
  'health_data_processing',
  '1.1.0',
  'fr',
  'Consentement au traitement des données de santé',
  $md$# Traitement de vos données de santé

Pour personnaliser votre plan d'entraînement et de nutrition, Hybride Club peut traiter des données considérées comme sensibles au sens du RGPD : fréquence cardiaque, sommeil, poids, douleurs et gênes que vous déclarez.

Ces données sont :

- utilisées uniquement pour générer et ajuster votre plan et vous fournir des explications sur les recommandations ;
- hébergées dans l'Union européenne ;
- jamais transmises à un tiers à des fins commerciales ;
- minimisées avant tout traitement par un fournisseur d'intelligence artificielle externe (aucune donnée directement identifiante ne lui est transmise).

## Si vous retirez ce consentement

Vous pouvez retirer ce consentement à tout moment depuis votre compte. Le retrait :

- purge vos données de saisie quotidienne rattachées à ce consentement (séances, nutrition, mesures corporelles, douleurs) ;
- bascule le coach en mode dégradé : ces données ne sont plus collectées ni modifiées tant que ce consentement n'est pas de nouveau accordé.

**Ce qui n'est volontairement pas supprimé.** Si vous avez déclaré, avant ce retrait, une pathologie ou un statut de mineur, l'indicateur correspondant est conservé même après le retrait de ce consentement : il continue de vous orienter vers un professionnel de santé avant de reprendre le programme, indépendamment de l'état de ce consentement. Cette conservation répond à un seul objectif, votre sécurité, et n'est utilisée à aucune autre fin (ni personnalisation, ni génération de plan). Comme le reste de ce document, sa base légale précise reste à faire valider par un conseil juridique avant mise en production.

Ce consentement est **distinct** du disclaimer produit et doit être recueilli séparément, avant toute saisie de données de santé (fréquence cardiaque, sommeil, poids, douleur).

## Suppression complète du compte

Indépendamment de ce consentement, vous pouvez à tout moment demander la suppression complète de votre compte depuis votre espace compte (droit à l'effacement, art. 17 RGPD). Cette suppression est totale : elle efface alors aussi les indicateurs de sécurité mentionnés ci-dessus.

*Contenu provisoire — à faire valider juridiquement avant mise en production.*
$md$,
  '',
  false
)
on conflict (code, version, locale) do nothing;

-- Checksum = empreinte sha256 du contenu (pgcrypto), même pattern que 0010_seed_referentials.sql
-- -- calculée plutôt que codée en dur, pour rester exacte quel que soit le contenu final du texte.
-- Scopée à cette seule ligne : les lignes déjà publiées (1.0.0 et les 3 autres documents) ne sont
-- jamais retouchées, conformément à l'immuabilité du registre.
update consent_documents
   set checksum = encode(digest(body_md, 'sha256'), 'hex')
 where code = 'health_data_processing' and version = '1.1.0' and locale = 'fr';
