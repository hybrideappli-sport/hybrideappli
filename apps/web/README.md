Application web (Next.js 16, App Router) de **Hybride Club** — coach IA personnalisé
(entraînement + nutrition, US-01), centralisation des données + score hybride (US-02) et
planning selon emploi du temps (US-03). Documentation de référence, dans l'ordre où la lire :

- `/07-spec-feature1-coach-ia.md` — fonctionnel US-01, fait foi (14 critères d'acceptation).
- `/09-spec-feature2-centralisation-donnees.md` — fonctionnel US-02 (10 critères d'acceptation).
- `/10-spec-feature3-planning-emploi-du-temps.md` — fonctionnel US-03 (6 critères d'acceptation).
- `/08-architecture.md` — stack, moteur à règles, contrats d'API, schéma, RGPD/RLS, déploiement
  (§13 = US-02, §14 = US-03).
- `/docs/db-schema.md` — DDL canonique (§10 = US-02, §11 = US-03).
- `/docs/adr/` — décisions d'architecture (ADR-001 à ADR-012 pour US-01 ; ADR-013 à ADR-015 pour
  US-02 : sync Strava, score hybride, réconciliation déclaré/connecté ; ADR-016/ADR-017 pour US-03 :
  placement horaire dérivé, clôture d'imprévu).
- `/plans/US-01-coach-ia-personnalise.md`, `/plans/US-02-centralisation-donnees.md`,
  `/plans/US-03-planning-emploi-du-temps.md` — plans d'implémentation par lot.

## Structure

```
apps/web/app/
  (marketing)/   accueil
  (auth)/        connexion, inscription, reset
  (app)/         dashboard, aujourd'hui, semaine, planning, données, abonnement, facturation
  onboarding/    chat coach, disclaimer, consentement
  api/v1/**      Route Handlers (contrats : 08-architecture.md §6, §13, §14)
    data/            connexions de sources, activités, vue d'ensemble (US-02)
    score/hybrid      score hybride (US-02)
    schedule/incidents signalement et clôture d'imprévu (US-03)
    webhooks/strava   réception événements Strava (US-02, ADR-013)
    cron/reconcile-data-sources, cron/enqueue-schedule-closeouts  jobs périodiques US-02/US-03
```

La logique métier critique vit hors de `apps/web`, dans les packages du monorepo :
`@hybride/rules-engine` (moteur à règles, pur, 0 I/O), `@hybride/coach-llm` (conversation et
rédaction), `@hybride/domain` (types + Zod partagés), `@hybride/db` (client Supabase typé).

## Configuration

Copier `/.env.local.example` en `.env.local` et le remplir — voir ce fichier pour le détail de
chaque variable (Supabase, Stripe, Mistral, Brevo, VAPID, `CRON_SECRET`, Strava). Aucune valeur
réelle n'est commitée.

Les six variables Strava (`STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`,
`STRAVA_WEBHOOK_PATH_SECRET`, `STRAVA_VERIFY_TOKEN`, `DATA_TOKEN_ENC_KEY`, `OAUTH_STATE_SECRET`)
sont requises ensemble en doctrine fail-closed : sans elles, toute la connexion de données US-02
est désactivée plutôt que dégradée silencieusement. `STRAVA_WEBHOOK_SUBSCRIPTION_ID` n'est
renseignée qu'après création de la souscription webhook (acte d'exploitation `devops`, voir
ADR-013 §1).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
