create table if not exists public.gmail_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  connection_id uuid not null references public.gmail_connections(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  job_id uuid references public.jobs(id) on delete set null,
  gmail_message_id text not null,
  gmail_thread_id text,
  sender_email text not null,
  sender_name text,
  subject text not null default '(No subject)',
  snippet text not null default '',
  received_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (connection_id, gmail_message_id)
);

alter table public.gmail_messages enable row level security;

drop policy if exists "Members can read Gmail messages" on public.gmail_messages;
create policy "Members can read Gmail messages"
  on public.gmail_messages for select
  using (public.is_org_member(organization_id));

create index if not exists gmail_messages_org_received_idx
  on public.gmail_messages (organization_id, received_at desc);
create index if not exists gmail_messages_job_received_idx
  on public.gmail_messages (job_id, received_at desc);
