-- S-02 ai-generation-review: user-scoped flashcards, AI generation metrics, atomic save RPC.
-- generations stores counts only (never the submitted text); flashcards are private per user.

-- ---------------------------------------------------------------------------
-- generations: one row per AI run (metrics only)
-- ---------------------------------------------------------------------------
create table public.generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  model text not null,
  -- 1,000–10,000 bounds are enforced in zod only (UTF-16 length vs char_length mismatch).
  input_length int not null check (input_length > 0),
  generated_count int not null check (generated_count >= 1),
  accepted_unedited_count int check (accepted_unedited_count >= 0),
  accepted_edited_count int check (accepted_edited_count >= 0),
  created_at timestamptz not null default now(),
  saved_at timestamptz
);

create index generations_user_id_idx on public.generations (user_id);

alter table public.generations enable row level security;

create policy generations_select_own on public.generations
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy generations_insert_own on public.generations
  for insert to authenticated
  with check (user_id = (select auth.uid()));

-- No UPDATE / DELETE policies: counts change only through save_generation().

-- ---------------------------------------------------------------------------
-- flashcards: the user's private deck
-- ---------------------------------------------------------------------------
create table public.flashcards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  generation_id uuid references public.generations (id) on delete set null,
  front text not null check (char_length(front) between 1 and 200),
  back text not null check (char_length(back) between 1 and 500),
  source text not null check (source in ('ai', 'ai-edited', 'manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index flashcards_user_id_idx on public.flashcards (user_id);
create index flashcards_generation_id_idx on public.flashcards (generation_id);

alter table public.flashcards enable row level security;

create policy flashcards_select_own on public.flashcards
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy flashcards_insert_own on public.flashcards
  for insert to authenticated
  with check (user_id = (select auth.uid()));

-- UPDATE / DELETE policies arrive with S-03.

-- ---------------------------------------------------------------------------
-- save_generation: insert accepted cards + set counts atomically, once per generation.
-- SECURITY DEFINER bypasses RLS, so every statement filters by auth.uid() explicitly.
-- ---------------------------------------------------------------------------
create function public.save_generation(p_generation_id uuid, p_cards jsonb)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_generation public.generations%rowtype;
  v_total int;
  v_edited int;
begin
  if v_uid is null then
    raise exception 'generation not found' using errcode = 'GN404';
  end if;

  if p_cards is null or jsonb_typeof(p_cards) <> 'array' then
    raise exception 'cards must be a json array' using errcode = '22023';
  end if;

  select * into v_generation
  from public.generations
  where id = p_generation_id and user_id = v_uid
  for update;

  if not found then
    raise exception 'generation not found' using errcode = 'GN404';
  end if;

  if v_generation.saved_at is not null then
    raise exception 'generation already saved' using errcode = 'GN409';
  end if;

  v_total := jsonb_array_length(p_cards);
  if v_total > v_generation.generated_count then
    raise exception 'more cards than generated' using errcode = '22023';
  end if;

  insert into public.flashcards (user_id, generation_id, front, back, source)
  select
    v_uid,
    p_generation_id,
    card ->> 'front',
    card ->> 'back',
    case when coalesce((card ->> 'edited')::boolean, false) then 'ai-edited' else 'ai' end
  from jsonb_array_elements(p_cards) as card;

  select count(*) into v_edited
  from jsonb_array_elements(p_cards) as card
  where coalesce((card ->> 'edited')::boolean, false);

  update public.generations
  set accepted_unedited_count = v_total - v_edited,
      accepted_edited_count = v_edited,
      saved_at = now()
  where id = p_generation_id and user_id = v_uid;

  return v_total;
end;
$$;

revoke execute on function public.save_generation(uuid, jsonb) from public, anon;
grant execute on function public.save_generation(uuid, jsonb) to authenticated;
