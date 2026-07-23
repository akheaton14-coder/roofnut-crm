create table if not exists public.gmail_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  email_address text not null,
  status text not null default 'connected' check (status in ('connected', 'error', 'disconnected')),
  scopes text[] not null default '{}',
  history_id text,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, email_address)
);

create table if not exists public.gmail_oauth_tokens (
  connection_id uuid primary key references public.gmail_connections(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  access_token_encrypted text not null,
  refresh_token_encrypted text,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.gmail_connections enable row level security;
alter table public.gmail_oauth_tokens enable row level security;

drop policy if exists "Members can read Gmail connections" on public.gmail_connections;
create policy "Members can read Gmail connections"
  on public.gmail_connections for select
  using (public.is_org_member(organization_id));

-- OAuth tokens intentionally have no browser-accessible policies. Only server-side
-- requests using the Supabase service role can read or change encrypted credentials.

create index if not exists gmail_connections_org_idx
  on public.gmail_connections (organization_id, connected_at desc);
