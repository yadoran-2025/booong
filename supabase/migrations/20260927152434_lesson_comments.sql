create table public.lesson_comments (
  id uuid primary key default gen_random_uuid(),
  resource_id text not null check (char_length(resource_id) between 1 and 120),
  author_sub uuid not null,
  author_name text not null check (char_length(author_name) between 1 and 100),
  kind text not null check (kind in ('comment', 'feedback')),
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

create index lesson_comments_resource_created_idx
  on public.lesson_comments (resource_id, created_at desc, id desc);

alter table public.lesson_comments enable row level security;
revoke all on public.lesson_comments from anon, authenticated, service_role;
grant select, insert on public.lesson_comments to service_role;
