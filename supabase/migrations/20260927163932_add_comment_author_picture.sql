alter table public.lesson_comments
  add column author_picture text
  constraint lesson_comments_author_picture_url check (
    author_picture is null or (char_length(author_picture) <= 2048 and author_picture like 'https://%')
  );
