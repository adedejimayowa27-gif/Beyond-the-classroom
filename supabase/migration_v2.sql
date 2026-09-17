-- ============================================================
-- Beyond The Classroom with MayorCity — migration to v2
-- Run this ONCE in Supabase (Dashboard > SQL Editor) if you
-- already had the original schema.sql live. It only adds new
-- columns/tables/policies — it does not touch your existing
-- editions or registrations.
--
-- Safe to re-run: every step below is written so running the
-- whole file twice won't error or duplicate anything.
-- ============================================================

-- ---- registrations: new columns ----
alter table registrations add column if not exists department text;
alter table registrations add column if not exists checked_in boolean not null default false;
alter table registrations add column if not exists checked_in_at timestamptz;

-- One email can only register once per edition. If you already have
-- duplicate emails in an edition from before this rule existed, this
-- index will fail to create — see the note at the bottom of this file.
create unique index if not exists registrations_edition_email_unique
  on registrations (edition_id, lower(email));

-- ---- waitlist: new table ----
create table if not exists waitlist (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references editions(id) on delete cascade,
  full_name text not null,
  email text not null,
  phone text not null,
  created_at timestamptz not null default now()
);

create index if not exists waitlist_edition_id_idx on waitlist (edition_id);

create unique index if not exists waitlist_edition_email_unique
  on waitlist (edition_id, lower(email));

alter table waitlist enable row level security;

drop policy if exists "Public join waitlist" on waitlist;
create policy "Public join waitlist" on waitlist
  for insert with check (true);

drop policy if exists "Admin read waitlist" on waitlist;
create policy "Admin read waitlist" on waitlist
  for select using (auth.role() = 'authenticated');

drop policy if exists "Admin delete waitlist" on waitlist;
create policy "Admin delete waitlist" on waitlist
  for delete using (auth.role() = 'authenticated');

-- ---- registrations: policies the old schema was missing ----
-- (the original schema only let admins SELECT registrations — checking
-- someone in or removing a mistaken entry needs UPDATE/DELETE too)
drop policy if exists "Admin update registrations" on registrations;
create policy "Admin update registrations" on registrations
  for update using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

drop policy if exists "Admin delete registrations" on registrations;
create policy "Admin delete registrations" on registrations
  for delete using (auth.role() = 'authenticated');

-- ---- register_applicant(): replace with the v2 version ----
-- The old function took 5 arguments; the app now calls it with 6
-- (it also adds department and blocks duplicate emails). Drop the old
-- signature first so Postgres doesn't keep both versions around.
drop function if exists register_applicant(uuid, text, text, text, text);

create or replace function register_applicant(
  p_edition_id uuid,
  p_full_name text,
  p_email text,
  p_phone text,
  p_photo_url text,
  p_department text
) returns registrations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_edition editions%rowtype;
  v_new_reg registrations%rowtype;
  v_ticket_code text;
  v_batch_count int;
  v_already_registered boolean;
begin
  select * into v_edition from editions where id = p_edition_id for update;

  if v_edition.id is null then
    raise exception 'EDITION_NOT_FOUND';
  end if;

  if v_edition.completed then
    raise exception 'EDITION_COMPLETED';
  end if;

  if not v_edition.is_open then
    raise exception 'BATCH_CLOSED';
  end if;

  select exists(
    select 1 from registrations
    where edition_id = p_edition_id and lower(email) = lower(p_email)
  ) into v_already_registered;

  if v_already_registered then
    raise exception 'DUPLICATE_EMAIL';
  end if;

  select count(*) into v_batch_count
  from registrations
  where edition_id = p_edition_id and batch_number = v_edition.current_batch;

  if v_batch_count >= v_edition.batch_size then
    update editions set is_open = false where id = p_edition_id;
    raise exception 'BATCH_CLOSED';
  end if;

  v_ticket_code := 'BTC-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));

  insert into registrations (edition_id, batch_number, full_name, email, phone, photo_url, department, ticket_code)
  values (p_edition_id, v_edition.current_batch, p_full_name, p_email, p_phone, p_photo_url, p_department, v_ticket_code)
  returning * into v_new_reg;

  v_batch_count := v_batch_count + 1;

  update editions
  set total_registered = total_registered + 1,
      is_open = case when v_batch_count >= v_edition.batch_size then false else is_open end,
      completed = case when (total_registered + 1) >= (max_batches * batch_size) then true else completed end
  where id = p_edition_id;

  return v_new_reg;
end;
$$;

grant execute on function register_applicant(uuid, text, text, text, text, text) to anon, authenticated;

-- ============================================================
-- If the "registrations_edition_email_unique" index above failed:
-- it means some past edition already has two registrations sharing
-- an email. Find them with the query below, decide which to keep,
-- then re-run just that "create unique index" statement.
--
--   select edition_id, lower(email), count(*)
--   from registrations
--   group by edition_id, lower(email)
--   having count(*) > 1;
-- ============================================================
