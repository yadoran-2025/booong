create table public.booong_notices (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  body text not null check (char_length(btrim(body)) between 1 and 5000),
  link text not null default '' check (char_length(link) <= 2000 and (link = '' or link ~ '^https?://')),
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index booong_notices_public_created_idx
  on public.booong_notices (created_at desc, id desc) where published;
alter table public.booong_notices enable row level security;
revoke all on public.booong_notices from anon, authenticated, service_role;
grant select, insert, update on public.booong_notices to service_role;
