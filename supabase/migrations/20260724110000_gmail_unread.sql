alter table public.gmail_messages
  add column if not exists read_at timestamptz;

update public.gmail_messages
set read_at = created_at
where read_at is null;

create index if not exists gmail_messages_unread_job_idx
  on public.gmail_messages (organization_id, job_id, received_at desc)
  where read_at is null and job_id is not null;
