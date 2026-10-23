-- Lukavac Info: admin dashboard, lokacije iz baze, statistika skeniranja, tajni kodovi, pečati i nagrade.
-- Migracija je aditivna: samo pravi nove tabele/funkcije i ništa ne briše.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Administratori
-- ---------------------------------------------------------------------------
create table if not exists public.admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- Globalne postavke (jedan red)
-- ---------------------------------------------------------------------------
create table if not exists public.settings (
  id             int primary key default 1 check (id = 1),
  stamps_enabled boolean not null default true,
  default_slug   text,
  about          jsonb not null default '{}'::jsonb,  -- {title:{bs,en,de}, text:{bs,en,de}}
  passport       jsonb not null default '{}'::jsonb,  -- {intro:{bs,en,de}}
  public_base_url text,                              -- npr. https://info.lukavac.ba (za QR kodove)
  updated_at     timestamptz not null default now()
);
insert into public.settings (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Lokacije (javni sadržaj; tajni kod je u odvojenoj tabeli)
-- ---------------------------------------------------------------------------
create table if not exists public.locations (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique
                  check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
                         and slug not in ('admin','api','data','images','audio','scripts','supabase','uvod','index','print','qr')),
  name            jsonb not null default '{}'::jsonb,   -- {bs,en,de}
  short           jsonb not null default '{}'::jsonb,   -- {bs,en,de}
  body            jsonb not null default '{}'::jsonb,   -- {bs:[pasusi], en:[…], de:[…]}
  more            jsonb,                                -- {bs:{sections:[{h,p:[]}]}, …}
  sources         jsonb not null default '[]'::jsonb,   -- [{t,u}]
  image           text,
  image_credit    text,
  gallery         jsonb not null default '[]'::jsonb,   -- [{src,credit}]
  compare         jsonb,                                -- {then,now}
  audio           jsonb not null default '{}'::jsonb,   -- {bs:url,en:url,de:url}
  lat             double precision not null check (lat between -90 and 90),
  lng             double precision not null check (lng between -180 and 180),
  mode            text not null default 'foot' check (mode in ('foot','car')),
  coords_verified boolean not null default false,
  status_note     text,
  sort_order      int not null default 0,
  published       boolean not null default true,
  stamp_enabled   boolean not null default true,
  gps_radius_m    int not null default 150 check (gps_radius_m between 10 and 5000),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Tajni kod iz QR-a (?k=…). Čita ga samo admin; mijenja se samo kroz regenerate_location_code().
create table if not exists public.location_secrets (
  location_id uuid primary key references public.locations(id) on delete cascade,
  code        text not null unique,
  rotated_at  timestamptz not null default now()
);

-- Nasumičan kod: 6 znakova bez slova/brojeva koji se lako zamijene (0/O, 1/l/I).
create or replace function public.gen_secret_code(len int default 6)
returns text
language plpgsql
volatile
set search_path = public, extensions
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  bytes bytea := extensions.gen_random_bytes(len);
  out text := '';
begin
  for i in 0 .. len - 1 loop
    out := out || substr(alphabet, 1 + (get_byte(bytes, i) % length(alphabet)), 1);
  end loop;
  return out;
end;
$$;

create or replace function public.locations_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare c text;
begin
  loop
    c := public.gen_secret_code();
    begin
      insert into public.location_secrets (location_id, code) values (new.id, c);
      exit;
    exception when unique_violation then
      if exists (select 1 from public.location_secrets where location_id = new.id) then exit; end if;
    end;
  end loop;
  return new;
end;
$$;
drop trigger if exists trg_locations_secret on public.locations;
create trigger trg_locations_secret after insert on public.locations
  for each row execute function public.locations_after_insert();

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;
drop trigger if exists trg_locations_touch on public.locations;
create trigger trg_locations_touch before update on public.locations
  for each row execute function public.touch_updated_at();
drop trigger if exists trg_settings_touch on public.settings;
create trigger trg_settings_touch before update on public.settings
  for each row execute function public.touch_updated_at();

-- Regeneracija koda: stari kod odmah prestaje važiti.
create or replace function public.regenerate_location_code(p_location uuid)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare c text;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  loop
    c := public.gen_secret_code();
    begin
      insert into public.location_secrets (location_id, code, rotated_at) values (p_location, c, now())
      on conflict (location_id) do update set code = excluded.code, rotated_at = now();
      return c;
    exception when unique_violation then
      -- isti kod već postoji na drugoj lokaciji: pokušaj ponovo
    end;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Prethodno izračunate rute (admin ih računa iz dashboarda preko OSRM/FOSSGIS)
-- ---------------------------------------------------------------------------
create table if not exists public.routes (
  from_id    uuid not null references public.locations(id) on delete cascade,
  to_id      uuid not null references public.locations(id) on delete cascade,
  mode       text not null check (mode in ('foot','car')),
  distance   int not null,
  duration   int not null,
  coords     jsonb not null,           -- [[lat,lng], …]
  from_lat   double precision, from_lng double precision,
  to_lat     double precision, to_lng   double precision,
  updated_at timestamptz not null default now(),
  primary key (from_id, to_id)
);

-- ---------------------------------------------------------------------------
-- Statistika i pečati (bez ličnih podataka: samo hash anonimnog ID-a uređaja)
-- ---------------------------------------------------------------------------
create table if not exists public.scans (
  id             bigint generated always as identity primary key,
  created_at     timestamptz not null default now(),
  location_id    uuid not null references public.locations(id) on delete cascade,
  device_hash    text not null,
  code_status    text not null check (code_status in ('none','valid','invalid')),
  gps_status     text not null check (gps_status in ('inside','outside','denied','unavailable','timeout','not_requested')),
  gps_distance_m int,
  stamp_result   text not null check (stamp_result in ('awarded','duplicate','no_code','invalid_code','disabled','rate_limited'))
);
create index if not exists scans_created_idx on public.scans (created_at);
create index if not exists scans_loc_created_idx on public.scans (location_id, created_at);
create index if not exists scans_device_idx on public.scans (device_hash, created_at);

create table if not exists public.stamps (
  id           bigint generated always as identity primary key,
  location_id  uuid not null references public.locations(id) on delete cascade,
  device_hash  text not null,
  gps_verified boolean not null default false,
  created_at   timestamptz not null default now(),
  unique (location_id, device_hash)
);
create index if not exists stamps_device_idx on public.stamps (device_hash);

-- ---------------------------------------------------------------------------
-- Nagrade, sponzori i preuzimanja
-- ---------------------------------------------------------------------------
create table if not exists public.rewards (
  id                    uuid primary key default gen_random_uuid(),
  title                 jsonb not null default '{}'::jsonb,   -- {bs,en,de}
  description           jsonb not null default '{}'::jsonb,   -- {bs,en,de}
  required_stamps       int check (required_stamps is null or required_stamps > 0),
  required_location_ids uuid[] not null default '{}',
  sponsor_name          text,
  sponsor_logo          text,
  sponsor_url           text,
  active                boolean not null default true,
  valid_until           date,
  sort_order            int not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
drop trigger if exists trg_rewards_touch on public.rewards;
create trigger trg_rewards_touch before update on public.rewards
  for each row execute function public.touch_updated_at();

create table if not exists public.reward_claims (
  id          bigint generated always as identity primary key,
  reward_id   uuid not null references public.rewards(id) on delete cascade,
  device_hash text not null,
  claim_code  text not null unique,
  created_at  timestamptz not null default now(),
  redeemed_at timestamptz,
  redeemed_by uuid references auth.users(id) on delete set null,
  unique (reward_id, device_hash)
);

-- ---------------------------------------------------------------------------
-- RLS: javni (anon) klijent nema direktan pristup ničemu.
-- Javni sadržaj ide kroz Vercel funkcije (/api/*) sa service_role ključem;
-- admin radi kroz Supabase Auth i politike is_admin().
-- ---------------------------------------------------------------------------
alter table public.admins           enable row level security;
alter table public.settings         enable row level security;
alter table public.locations        enable row level security;
alter table public.location_secrets enable row level security;
alter table public.routes           enable row level security;
alter table public.scans            enable row level security;
alter table public.stamps           enable row level security;
alter table public.rewards          enable row level security;
alter table public.reward_claims    enable row level security;

revoke all on public.admins, public.settings, public.locations, public.location_secrets, public.routes,
              public.scans, public.stamps, public.rewards, public.reward_claims from anon;
-- Ulogovani ne-admin korisnik također ne vidi ništa (politike ispod traže is_admin()).
revoke insert, update, delete on public.location_secrets, public.scans, public.stamps from authenticated;
revoke insert, delete on public.reward_claims from authenticated;
revoke insert, update, delete on public.admins from authenticated;

drop policy if exists admins_self_read on public.admins;
create policy admins_self_read on public.admins for select to authenticated using (user_id = auth.uid());

drop policy if exists settings_admin on public.settings;
create policy settings_admin on public.settings for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists locations_admin on public.locations;
create policy locations_admin on public.locations for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists secrets_admin_read on public.location_secrets;
create policy secrets_admin_read on public.location_secrets for select to authenticated using (public.is_admin());

drop policy if exists routes_admin on public.routes;
create policy routes_admin on public.routes for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists scans_admin_read on public.scans;
create policy scans_admin_read on public.scans for select to authenticated using (public.is_admin());

drop policy if exists stamps_admin_read on public.stamps;
create policy stamps_admin_read on public.stamps for select to authenticated using (public.is_admin());

drop policy if exists rewards_admin on public.rewards;
create policy rewards_admin on public.rewards for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists claims_admin_read on public.reward_claims;
create policy claims_admin_read on public.reward_claims for select to authenticated using (public.is_admin());

-- Funkcije: zaključaj podrazumijevani EXECUTE za PUBLIC.
revoke execute on function public.gen_secret_code(int) from public, anon, authenticated;
revoke execute on function public.locations_after_insert() from public, anon, authenticated;
revoke execute on function public.regenerate_location_code(uuid) from public, anon;
grant  execute on function public.regenerate_location_code(uuid) to authenticated;
grant  execute on function public.is_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: javno čitanje, upload/izmjena samo za admina
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;

drop policy if exists media_admin_insert on storage.objects;
create policy media_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and public.is_admin());
drop policy if exists media_admin_update on storage.objects;
create policy media_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'media' and public.is_admin()) with check (bucket_id = 'media' and public.is_admin());
drop policy if exists media_admin_delete on storage.objects;
create policy media_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'media' and public.is_admin());
drop policy if exists media_admin_select on storage.objects;
create policy media_admin_select on storage.objects for select to authenticated
  using (bucket_id = 'media' and public.is_admin());
