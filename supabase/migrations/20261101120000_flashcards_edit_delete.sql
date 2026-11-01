-- S-03 deck-browse-edit-delete: owner-only delete, content-only edits through an RPC,
-- and an index for the deck list ordering (created_at desc, id desc).

-- ---------------------------------------------------------------------------
-- DELETE: owners may delete their own cards. review_logs cascade with the card;
-- generations counts are a save-time snapshot and stay untouched.
-- ---------------------------------------------------------------------------
create policy flashcards_delete_own on public.flashcards
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Still NO UPDATE policy on public.flashcards: RLS cannot restrict columns, so a plain
-- owner UPDATE policy would let clients rewrite SRS columns, source, user_id or
-- generation_id via PostgREST. Content changes go only through update_flashcard_content();
-- SRS changes go only through review_flashcard().

-- ---------------------------------------------------------------------------
-- Deck list ordering: newest first, id as a tie-breaker (a save_generation batch
-- shares one created_at).
-- ---------------------------------------------------------------------------
create index flashcards_user_id_created_at_idx
  on public.flashcards (user_id, created_at desc, id desc);

-- ---------------------------------------------------------------------------
-- update_flashcard_content: edit front/back of the caller's card, preserving SRS state.
-- SECURITY DEFINER bypasses RLS, so every statement filters by auth.uid() explicitly.
-- A real content change bumps updated_at and flips source 'ai' -> 'ai-edited';
-- an unchanged-content call writes nothing and returns the current row.
-- ---------------------------------------------------------------------------
create function public.update_flashcard_content(
  p_flashcard_id uuid,
  p_front text,
  p_back text
)
returns public.flashcards
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_card public.flashcards;
  v_front text := btrim(p_front);
  v_back text := btrim(p_back);
begin
  if v_uid is null then
    raise exception 'flashcard not found' using errcode = 'FC404';
  end if;

  select f.* into v_card
  from public.flashcards f
  where f.id = p_flashcard_id and f.user_id = v_uid
  for update;

  if not found then
    raise exception 'flashcard not found' using errcode = 'FC404';
  end if;

  if v_front is null or v_front = '' or v_back is null or v_back = '' then
    raise exception 'front and back must not be blank' using errcode = '22023';
  end if;

  if v_front is distinct from v_card.front or v_back is distinct from v_card.back then
    update public.flashcards f
    set front = v_front,
        back = v_back,
        updated_at = now(),
        source = case when f.source = 'ai' then 'ai-edited' else f.source end
    where f.id = p_flashcard_id and f.user_id = v_uid
    returning f.* into v_card;
  end if;

  return v_card;
end;
$$;

revoke execute on function public.update_flashcard_content(uuid, text, text) from public, anon;
grant execute on function public.update_flashcard_content(uuid, text, text) to authenticated;
