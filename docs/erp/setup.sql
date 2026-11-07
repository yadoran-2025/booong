-- Reviewed setup SQL; run once in the existing BOOONG database before enabling the page.
-- No existing tables, rows, auth settings or deployments are changed.
begin;
create table public.booong_research_entries (
  id uuid primary key,
  date date not null check (date between date '2000-01-01' and date '2099-12-31'),
  category text not null check (category in ('revenue','other_income','coffee','meal','rent','other_expense')),
  amount bigint not null check (amount between 1 and 999999999999),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  counterparty text not null default '' check (char_length(counterparty) <= 120),
  memo text not null default '' check (char_length(memo) <= 1000),
  voided boolean not null default false,
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  updated_by text not null check (char_length(updated_by) between 3 and 320)
);
create index booong_research_entries_date_id on public.booong_research_entries (date desc, id desc);
create table public.booong_research_entry_history (
  event_id bigint generated always as identity primary key,
  entry_id uuid not null references public.booong_research_entries(id),
  revision integer not null,
  recorded_at timestamptz not null default clock_timestamp(),
  actor text not null,
  before_value jsonb,
  after_value jsonb not null,
  unique(entry_id, revision)
);
alter table public.booong_research_entries enable row level security;
alter table public.booong_research_entry_history enable row level security;
revoke all on public.booong_research_entries, public.booong_research_entry_history from public, anon, authenticated, service_role;
grant select, insert, update on public.booong_research_entries to service_role;
grant select, insert on public.booong_research_entry_history to service_role;
revoke all on sequence public.booong_research_entry_history_event_id_seq from public, anon, authenticated;
grant usage on sequence public.booong_research_entry_history_event_id_seq to service_role;

create function public.booong_research_entry_stamp() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if TG_OP = 'INSERT' then
    NEW.revision := 1;
    NEW.created_at := clock_timestamp();
  else
    if NEW.id <> OLD.id or NEW.created_at <> OLD.created_at or NEW.revision <> OLD.revision + 1 then
      raise exception 'Invalid entry revision';
    end if;
  end if;
  NEW.updated_at := clock_timestamp();
  return NEW;
end;
$$;
create function public.booong_research_entry_audit() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.booong_research_entry_history (entry_id, revision, actor, before_value, after_value)
  values (NEW.id, NEW.revision, NEW.updated_by, case when TG_OP = 'UPDATE' then to_jsonb(OLD) else null end, to_jsonb(NEW));
  return NEW;
end;
$$;
revoke all on function public.booong_research_entry_stamp(), public.booong_research_entry_audit() from public, anon, authenticated;
grant execute on function public.booong_research_entry_stamp(), public.booong_research_entry_audit() to service_role;
create trigger booong_research_entry_stamp before insert or update on public.booong_research_entries for each row execute function public.booong_research_entry_stamp();
create trigger booong_research_entry_audit after insert or update on public.booong_research_entries for each row execute function public.booong_research_entry_audit();
commit;
