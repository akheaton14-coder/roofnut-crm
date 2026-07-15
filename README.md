# Roofnut CRM

Roofnut's private customer, sales, estimating, production, and AI operations platform.

## Stack

- Next.js and React
- Supabase Postgres, Auth, and Storage
- Vercel deployment from GitHub

## Local development

1. Copy `.env.example` to `.env.local` and add the Supabase project values.
2. Install dependencies with `npm install`.
3. Run `npm run dev`.

## Database

The initial database schema, row-level security policies, and private `job-files`
storage bucket are defined in `supabase/migrations/20260714200000_initial_crm.sql`.

## Checks

- `npm run typecheck`
- `npm run build`
