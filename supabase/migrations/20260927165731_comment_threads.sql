alter table public.lesson_comments
  add column parent_id uuid references public.lesson_comments(id),
  add column edited_at timestamptz,
  add column deleted_at timestamptz;

create index lesson_comments_parent_idx on public.lesson_comments (parent_id);
grant update on public.lesson_comments to service_role;
