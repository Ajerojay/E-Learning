-- The curated library has one published lesson for each game.
-- Archived rows remain available for re-upload and legacy Letters shares Alphabets' slot.
create unique index if not exists video_lessons_published_game_category_unique
on public.video_lessons ((case when category = 'Letters' then 'Alphabets' else category end))
where is_published = true
  and category in ('Colors', 'Shapes', 'Letters', 'Alphabets', 'Numbers', 'Phonics', 'Logic');
