-- ============================================================
-- Beyond The Classroom with MayorCity — database schema
-- Run this whole file once in Supabase: Dashboard > SQL Editor
-- ============================================================

create extension if not exists "pgcrypto";

-- One row per monthly edition (holds the banner picture + batch settings)
create table editions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  banner_url text,
  batch_size int not null default 10,
  max_batches int not null default 4,
  current_batch int not null default 1,
  total_registered int not null default 0,
  is_open boolean not null default true,
  completed boolean not null default false,
  created_at timestamptz not null default now()
);

-- One row per applicant
create table registrations (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references editions(id) on delete cascade,
  batch_number int not null,
  full_name text not null,
  email text not null,
  phone text not null,
  photo_url text,
  ticket_code text not null unique,
  created_at timestamptz not null default now()
);

create index on registrations (edition_id);
create index on registrations (ticket_code);

-- ------------------------------------------------------------
-- Atomic registration: locks the edition row so two people
-- submitting at the same moment near spot #10 can't both get in.
-- ------------------------------------------------------------
create or replace function register_applicant(
  p_edition_id uuid,
  p_full_name text,
  p_email text,
  p_phone text,
  p_photo_url text
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

  select count(*) into v_batch_count
  from registrations
  where edition_id = p_edition_id and batch_number = v_edition.current_batch;

  if v_batch_count >= v_edition.batch_size then
    update editions set is_open = false where id = p_edition_id;
    raise exception 'BATCH_CLOSED';
  end if;

  v_ticket_code := 'BTC-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));

  insert into registrations (edition_id, batch_number, full_name, email, phone, photo_url, ticket_code)
  values (p_edition_id, v_edition.current_batch, p_full_name, p_email, p_phone, p_photo_url, v_ticket_code)
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

grant execute on function register_applicant to anon, authenticated;

-- ------------------------------------------------------------
-- Row Level Security
-- ------------------------------------------------------------
alter table editions enable row level security;
alter table registrations enable row level security;

-- Everyone can read edition info (banner, status) to render the page
create policy "Public read editions" on editions
  for select using (true);

-- Only signed-in admins can create/edit editions (open/close batches, new banner)
create policy "Admin manage editions" on editions
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- Applicants cannot read/write registrations directly — everything goes
-- through register_applicant() above, which runs as SECURITY DEFINER.
-- Only admins can browse the registrations list.
create policy "Admin read registrations" on registrations
  for select using (auth.role() = 'authenticated');

-- ------------------------------------------------------------
-- Storage: create these two buckets first in Dashboard > Storage
--   1. edition-banners     (public bucket)
--   2. applicant-photos    (public bucket)
-- Then run the policies below.
-- ------------------------------------------------------------
create policy "Public read banners" on storage.objects
  for select using (bucket_id = 'edition-banners');

create policy "Admin upload banners" on storage.objects
  for insert with check (bucket_id = 'edition-banners' and auth.role() = 'authenticated');

create policy "Public read applicant photos" on storage.objects
  for select using (bucket_id = 'applicant-photos');

create policy "Public upload applicant photos" on storage.objects
  for insert with check (bucket_id = 'applicant-photos');
