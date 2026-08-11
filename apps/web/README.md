Application web (Next.js 16, App Router) de **Hybride Club** — le coach IA personnalisé
(entraînement + nutrition) de la feature US-01. Documentation de référence, dans l'ordre où la lire :

- `/07-spec-feature1-coach-ia.md` — fonctionnel, fait foi (14 critères d'acceptation).
- `/08-architecture.md` — stack, moteur à règles, contrats d'API, schéma, RGPD/RLS, déploiement.
- `/docs/db-schema.md` — DDL canonique (34 tables).
- `/docs/adr/` — décisions d'architecture (ADR-001 à ADR-012).
- `/plans/US-01-coach-ia-personnalise.md` — plan d'implémentation par lot.

## Structure

```
apps/web/app/
  (marketing)/   accueil
  (auth)/        connexion, inscription, reset
  (app)/         dashboard, aujourd'hui, semaine, abonnement, facturation
  onboarding/    chat coach, disclaimer, consentement
  api/v1/**      Route Handlers (contrats : 08-architecture.md §6)
```

La logique métier critique vit hors de `apps/web`, dans les packages du monorepo :
`@hybride/rules-engine` (moteur à règles, pur, 0 I/O), `@hybride/coach-llm` (conversation et
rédaction), `@hybride/domain` (types + Zod partagés), `@hybride/db` (client Supabase typé).

## Configuration

Copier `/.env.local.example` en `.env.local` et le remplir — voir ce fichier pour le détail de
chaque variable (Supabase, Stripe, Mistral, Brevo, VAPID, `CRON_SECRET`). Aucune valeur réelle n'est
commitée.

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
