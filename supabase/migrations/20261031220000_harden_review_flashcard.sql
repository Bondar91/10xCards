-- impl-review srs-review-session F2/F6.
-- F2: review_flashcard range checks used `< 0`, which lets 'NaN' / 'Infinity' (float8) and
-- 'infinity' (timestamptz) through via direct PostgREST calls; ts-fsrs then throws on such a card
-- and the user's queue returns 500 permanently. Reject non-finite values and require
-- p_last_review (always = review time from ts-fsrs next()) within the same 300 s window.
-- F6: the (user_id, due) index makes the single-column user_id index redundant.

drop index if exists public.flashcards_user_id_idx;

create or replace function public.review_flashcard(
  p_flashcard_id uuid,
  p_expected_reps int,
  p_due timestamptz,
  p_stability float8,
  p_difficulty float8,
  p_elapsed_days int,
  p_scheduled_days int,
  p_learning_steps int,
  p_reps int,
  p_lapses int,
  p_state smallint,
  p_last_review timestamptz,
  p_log jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_reps int;
  v_rating int;
  v_log_state int;
  v_review timestamptz;
  v_log_due timestamptz;
  v_log_stability float8;
  v_log_difficulty float8;
  v_log_scheduled_days int;
  v_log_learning_steps int;
begin
  if v_uid is null then
    raise exception 'flashcard not found' using errcode = 'RV404';
  end if;

  select f.reps into v_reps
  from public.flashcards f
  where f.id = p_flashcard_id and f.user_id = v_uid
  for update;

  if not found then
    raise exception 'flashcard not found' using errcode = 'RV404';
  end if;

  if v_reps <> p_expected_reps then
    raise exception 'flashcard state changed' using errcode = 'RV409';
  end if;

  if p_reps is distinct from p_expected_reps + 1
     or p_due is null or not isfinite(p_due)
     or p_stability is null or p_stability < 0
     or p_stability = 'NaN'::float8 or p_stability = 'Infinity'::float8
     or p_difficulty is null or p_difficulty < 0
     or p_difficulty = 'NaN'::float8 or p_difficulty = 'Infinity'::float8
     or p_last_review is null or not isfinite(p_last_review)
     or abs(extract(epoch from (p_last_review - now()))) > 300
     or p_elapsed_days is null or p_elapsed_days < 0
     or p_scheduled_days is null or p_scheduled_days < 0
     or p_learning_steps is null or p_learning_steps < 0
     or p_lapses is null or p_lapses < 0
     or p_state is null or p_state not between 0 and 3 then
    raise exception 'invalid card state' using errcode = '22023';
  end if;

  if p_log is null or jsonb_typeof(p_log) <> 'object' then
    raise exception 'log must be a json object' using errcode = '22023';
  end if;

  begin
    v_rating := (p_log ->> 'rating')::int;
    v_log_state := (p_log ->> 'state')::int;
    v_review := (p_log ->> 'review')::timestamptz;
    v_log_due := (p_log ->> 'due')::timestamptz;
    v_log_stability := (p_log ->> 'stability')::float8;
    v_log_difficulty := (p_log ->> 'difficulty')::float8;
    v_log_scheduled_days := (p_log ->> 'scheduled_days')::int;
    v_log_learning_steps := (p_log ->> 'learning_steps')::int;
  exception when others then
    raise exception 'invalid log' using errcode = '22023';
  end;

  if v_rating is null or v_rating not between 1 and 4
     or v_log_state is null or v_log_state not between 0 and 3
     or v_review is null or not isfinite(v_review)
     or abs(extract(epoch from (v_review - now()))) > 300
     or v_log_due is null or not isfinite(v_log_due)
     or v_log_stability is null or v_log_stability < 0
     or v_log_stability = 'NaN'::float8 or v_log_stability = 'Infinity'::float8
     or v_log_difficulty is null or v_log_difficulty < 0
     or v_log_difficulty = 'NaN'::float8 or v_log_difficulty = 'Infinity'::float8
     or v_log_scheduled_days is null or v_log_scheduled_days < 0
     or v_log_learning_steps is null or v_log_learning_steps < 0 then
    raise exception 'invalid log' using errcode = '22023';
  end if;

  update public.flashcards
  set due = p_due,
      stability = p_stability,
      difficulty = p_difficulty,
      elapsed_days = p_elapsed_days,
      scheduled_days = p_scheduled_days,
      learning_steps = p_learning_steps,
      reps = p_reps,
      lapses = p_lapses,
      state = p_state,
      last_review = p_last_review
  where id = p_flashcard_id and user_id = v_uid;

  insert into public.review_logs (
    user_id, flashcard_id, rating, state, due, stability, difficulty,
    scheduled_days, learning_steps, review
  )
  values (
    v_uid,
    p_flashcard_id,
    v_rating,
    v_log_state,
    v_log_due,
    v_log_stability,
    v_log_difficulty,
    v_log_scheduled_days,
    v_log_learning_steps,
    v_review
  );
end;
$$;

revoke execute on function public.review_flashcard(
  uuid, int, timestamptz, float8, float8, int, int, int, int, int, smallint, timestamptz, jsonb
) from public, anon;
grant execute on function public.review_flashcard(
  uuid, int, timestamptz, float8, float8, int, int, int, int, int, smallint, timestamptz, jsonb
) to authenticated;
