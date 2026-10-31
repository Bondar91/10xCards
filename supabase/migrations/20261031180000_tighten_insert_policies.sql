-- impl-review F1: stop authenticated users from forging metrics or "AI" cards via direct PostgREST inserts.
-- Accepted counts and saved_at are written only by save_generation() (SECURITY DEFINER, bypasses RLS).

drop policy generations_insert_own on public.generations;

create policy generations_insert_own on public.generations
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and saved_at is null
    and accepted_unedited_count is null
    and accepted_edited_count is null
  );

-- AI cards are inserted only by save_generation(); direct inserts are reserved for manual cards (S-04).
drop policy flashcards_insert_own on public.flashcards;

create policy flashcards_insert_own on public.flashcards
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and source = 'manual'
    and generation_id is null
  );
