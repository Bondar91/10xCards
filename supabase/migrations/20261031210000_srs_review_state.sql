-- S-05 srs-review-session: FSRS state on flashcards, append-only review log, queue + rating functions.
-- Scheduling is computed server-side by ts-fsrs@5; the database only stores and guards state.

-- ---------------------------------------------------------------------------
-- flashcards: FSRS card state (defaults = ts-fsrs createEmptyCard(), backfills existing rows as New)
-- ---------------------------------------------------------------------------
alter table public.flashcards
  add column due timestamptz not null default now(),
  add column stability double precision not null default 0,
  add column difficulty double precision not null default 0,
  -- Deprecated in ts-fsrs v5 (removed in v6) but still part of the v5 Card type.
  add column elapsed_days int not null default 0,
  add column scheduled_days int not null default 0,
  add column learning_steps int not null default 0,
  add column reps int not null default 0,
  add column lapses int not null default 0,
  add column state smallint not null default 0 check (state between 0 and 3),
  add column last_review timestamptz;

create index flashcards_user_id_due_idx on public.flashcards (user_id, due);

-- No UPDATE policy: SRS columns change only through review_flashcard(); content editing arrives with S-03.

-- ---------------------------------------------------------------------------
-- review_logs: one row per rating (ts-fsrs ReviewLog; state = state BEFORE the rating)
-- ---------------------------------------------------------------------------
create table public.review_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  flashcard_id uuid not null references public.flashcards (id) on delete cascade,
  rating smallint not null check (rating between 1 and 4),
  state smallint not null check (state between 0 and 3),
  due timestamptz not null,
  stability double precision not null,
  difficulty double precision not null,
  scheduled_days int not null,
  learning_steps int not null,
  review timestamptz not null
);

create index review_logs_user_id_review_idx on public.review_logs (user_id, review);
create index review_logs_flashcard_id_idx on public.review_logs (flashcard_id);

alter table public.review_logs enable row level security;

create policy review_logs_select_own on public.review_logs
  for select to authenticated
  using (user_id = (select auth.uid()));

-- No INSERT / UPDATE / DELETE policies: rows are written only by review_flashcard().

-- ---------------------------------------------------------------------------
-- get_review_queue: due cards, oldest due first, ties shuffled.
-- SECURITY INVOKER — RLS still applies. due_total is evaluated before LIMIT (window function).
-- ---------------------------------------------------------------------------
create function public.get_review_queue(p_limit int)
returns table (
  id uuid,
  front text,
  back text,
  due timestamptz,
  stability double precision,
  difficulty double precision,
  elapsed_days int,
  scheduled_days int,
  learning_steps int,
  reps int,
  lapses int,
  state smallint,
  last_review timestamptz,
  due_total bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    f.id,
    f.front,
    f.back,
    f.due,
    f.stability,
    f.difficulty,
    f.elapsed_days,
    f.scheduled_days,
    f.learning_steps,
    f.reps,
    f.lapses,
    f.state,
    f.last_review,
    count(*) over () as due_total
  from public.flashcards f
  where f.user_id = (select auth.uid())
    and f.due <= now()
  order by f.due, random()
  limit least(greatest(p_limit, 1), 50);
$$;

revoke execute on function public.get_review_queue(int) from public, anon;
grant execute on function public.get_review_queue(int) to authenticated;

-- ---------------------------------------------------------------------------
-- review_flashcard: write new SRS state + log atomically, guarded by reps (optimistic version).
-- SECURITY DEFINER bypasses RLS, so every statement filters by auth.uid() explicitly.
-- Accepted risk (plan-review F4): callable directly via PostgREST; range checks below keep
-- forged values plausible and limited to the caller's own cards.
-- ---------------------------------------------------------------------------
create function public.review_flashcard(
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
     or p_due is null
     or p_stability is null or p_stability < 0
     or p_difficulty is null or p_difficulty < 0
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
     or v_review is null
     or abs(extract(epoch from (v_review - now()))) > 300
     or v_log_due is null
     or v_log_stability is null or v_log_stability < 0
     or v_log_difficulty is null or v_log_difficulty < 0
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
