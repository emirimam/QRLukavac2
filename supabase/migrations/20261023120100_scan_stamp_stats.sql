-- Serverske funkcije: bilježenje skeniranja, dodjela pečata, nagrade, statistika.
-- record_scan i get_passport smije zvati SAMO service_role (Vercel funkcije /api/scan i /api/passport).

-- Udaljenost u metrima (haversine)
create or replace function public.distance_m(lat1 double precision, lng1 double precision,
                                             lat2 double precision, lng2 double precision)
returns double precision
language sql
immutable
as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ));
$$;

-- Kod za preuzimanje nagrade, npr. "K7MQ-4XPA" (samo velika slova i brojevi bez 0/O/1/I)
create or replace function public.gen_claim_code()
returns text
language plpgsql
volatile
set search_path = public, extensions
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  bytes bytea := extensions.gen_random_bytes(8);
  out text := '';
begin
  for i in 0 .. 7 loop
    if i = 4 then out := out || '-'; end if;
    out := out || substr(alphabet, 1 + (get_byte(bytes, i) % length(alphabet)), 1);
  end loop;
  return out;
end;
$$;

-- Dodijeli kodove za sve nagrade koje je uređaj upravo ispunio. Vraća nove nagrade.
create or replace function public.issue_rewards(p_device text)
returns setof uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  r record;
  n_stamps int;
  have uuid[];
  c text;
begin
  select count(*)::int, coalesce(array_agg(s.location_id), '{}')
    into n_stamps, have
    from public.stamps s join public.locations l on l.id = s.location_id
   where s.device_hash = p_device;

  for r in
    select * from public.rewards
     where active
       and (valid_until is null or valid_until >= (now() at time zone 'Europe/Sarajevo')::date)
       and (required_stamps is not null or cardinality(required_location_ids) > 0)
  loop
    if (r.required_stamps is null or n_stamps >= r.required_stamps)
       and (r.required_location_ids <@ have)
       and not exists (select 1 from public.reward_claims where reward_id = r.id and device_hash = p_device) then
      loop
        c := public.gen_claim_code();
        begin
          insert into public.reward_claims (reward_id, device_hash, claim_code) values (r.id, p_device, c);
          return next r.id;
          exit;
        exception when unique_violation then
          if exists (select 1 from public.reward_claims where reward_id = r.id and device_hash = p_device) then exit; end if;
        end;
      end loop;
    end if;
  end loop;
end;
$$;

-- Glavna funkcija za skeniranje.
--   p_slug        slug lokacije iz adrese (/vila)
--   p_code        kod iz ?k= (ili null)
--   p_device      HASH anonimnog ID-a uređaja (hashira Vercel funkcija sa tajnom soli)
--   p_gps_status  'granted' | 'denied' | 'unavailable' | 'timeout' | 'not_requested'
--   p_lat, p_lng  koordinate (samo ako je GPS dozvoljen); ne spremaju se, čuva se samo udaljenost
create or replace function public.record_scan(p_slug text, p_code text, p_device text,
                                              p_gps_status text, p_lat double precision, p_lng double precision)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  loc       public.locations%rowtype;
  secret    text;
  st        public.settings%rowtype;
  v_code    text;
  v_gps     text;
  v_dist    int;
  v_result  text;
  v_gps_ok  boolean := false;
  v_new     uuid[];
  v_recent_invalid int;
begin
  if p_device is null or length(p_device) < 16 then
    return jsonb_build_object('ok', false, 'error', 'bad_device');
  end if;

  select * into loc from public.locations where slug = lower(p_slug) and published;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  select * into st from public.settings where id = 1;
  select code into secret from public.location_secrets where location_id = loc.id;

  -- status koda
  if p_code is null or btrim(p_code) = '' then
    v_code := 'none';
  elsif secret is not null and p_code = secret then
    v_code := 'valid';
  else
    v_code := 'invalid';
  end if;

  -- GPS (dodatak, ne uslov)
  if p_gps_status = 'granted' and p_lat is not null and p_lng is not null then
    v_dist := round(public.distance_m(loc.lat, loc.lng, p_lat, p_lng));
    v_gps := case when v_dist <= loc.gps_radius_m then 'inside' else 'outside' end;
    v_gps_ok := v_dist <= loc.gps_radius_m;
  elsif p_gps_status in ('denied','unavailable','timeout') then
    v_gps := p_gps_status;
  else
    v_gps := 'not_requested';
  end if;

  -- zaštita od pogađanja koda: najviše 10 pogrešnih kodova po uređaju u zadnjih sat vremena
  select count(*) into v_recent_invalid from public.scans
   where device_hash = p_device and code_status = 'invalid' and created_at > now() - interval '1 hour';

  if v_code = 'none' then
    v_result := 'no_code';
  elsif v_recent_invalid >= 10 then
    v_result := 'rate_limited';
  elsif v_code = 'invalid' then
    v_result := 'invalid_code';
  elsif not (coalesce(st.stamps_enabled, true) and loc.stamp_enabled) then
    v_result := 'disabled';
  else
    insert into public.stamps (location_id, device_hash, gps_verified)
    values (loc.id, p_device, v_gps_ok)
    on conflict (location_id, device_hash) do nothing;
    if found then
      v_result := 'awarded';
    else
      v_result := 'duplicate';
      -- ako je raniji pečat bio bez GPS-a, a sada je GPS potvrđen, nadogradi ga
      if v_gps_ok then
        update public.stamps set gps_verified = true
         where location_id = loc.id and device_hash = p_device and not gps_verified;
      end if;
    end if;
  end if;

  insert into public.scans (location_id, device_hash, code_status, gps_status, gps_distance_m, stamp_result)
  values (loc.id, p_device, v_code, v_gps, v_dist, v_result);

  if v_result in ('awarded','duplicate') then
    select coalesce(array_agg(x), '{}') into v_new from public.issue_rewards(p_device) as x;
  else
    v_new := '{}';
  end if;

  return jsonb_build_object(
    'ok', true,
    'stamp', v_result,
    'gpsVerified', v_gps_ok,
    'gps', v_gps,
    'newRewards', to_jsonb(v_new)
  );
end;
$$;

-- Pasoš uređaja: pečati, napredak prema nagradama i kodovi osvojenih nagrada.
create or replace function public.get_passport(p_device text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_stamps jsonb;
  v_rewards jsonb;
  n int;
begin
  if p_device is null or length(p_device) < 16 then
    return jsonb_build_object('stamps', '[]'::jsonb, 'rewards', '[]'::jsonb);
  end if;
  perform public.issue_rewards(p_device);

  select coalesce(jsonb_agg(jsonb_build_object('slug', l.slug, 'gpsVerified', s.gps_verified, 'at', s.created_at) order by s.created_at), '[]'::jsonb),
         count(*)
    into v_stamps, n
    from public.stamps s join public.locations l on l.id = s.location_id and l.published
   where s.device_hash = p_device;

  select coalesce(jsonb_agg(x order by (x->>'sort')::int, x->>'id'), '[]'::jsonb) into v_rewards
  from (
    select jsonb_build_object(
      'id', r.id,
      'sort', r.sort_order,
      'title', r.title,
      'description', r.description,
      'requiredStamps', r.required_stamps,
      'requiredLocations', (select coalesce(jsonb_agg(l.slug), '[]'::jsonb) from public.locations l where l.id = any(r.required_location_ids)),
      'sponsor', jsonb_build_object('name', r.sponsor_name, 'logo', r.sponsor_logo, 'url', r.sponsor_url),
      'validUntil', r.valid_until,
      'have', n,
      'claimCode', c.claim_code,
      'redeemed', c.redeemed_at is not null
    ) as x
    from public.rewards r
    left join public.reward_claims c on c.reward_id = r.id and c.device_hash = p_device
    where (r.active and (r.valid_until is null or r.valid_until >= (now() at time zone 'Europe/Sarajevo')::date))
       or c.id is not null
  ) q;

  return jsonb_build_object('stamps', v_stamps, 'rewards', v_rewards);
end;
$$;

-- Admin: provjera koda nagrade kod sponzora
create or replace function public.lookup_claim(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare res jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select jsonb_build_object(
    'code', c.claim_code, 'createdAt', c.created_at, 'redeemedAt', c.redeemed_at,
    'reward', jsonb_build_object('id', r.id, 'title', r.title, 'sponsor', r.sponsor_name, 'active', r.active, 'validUntil', r.valid_until))
    into res
    from public.reward_claims c join public.rewards r on r.id = c.reward_id
   where c.claim_code = upper(btrim(p_code));
  return res;  -- null ako kod ne postoji
end;
$$;

create or replace function public.redeem_claim(p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare res jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.reward_claims set redeemed_at = now(), redeemed_by = auth.uid()
   where claim_code = upper(btrim(p_code)) and redeemed_at is null;
  if not found then
    return jsonb_build_object('ok', false, 'claim', public.lookup_claim(p_code));
  end if;
  return jsonb_build_object('ok', true, 'claim', public.lookup_claim(p_code));
end;
$$;

-- Admin: kompletna statistika za početni ekran (vrijeme po Sarajevu).
create or replace function public.admin_stats(p_days int default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  tz constant text := 'Europe/Sarajevo';
  today date := (now() at time zone tz)::date;
  d0 date;
  res jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  p_days := greatest(7, least(coalesce(p_days, 30), 365));
  d0 := today - (p_days - 1);

  with s as (
    select sc.*, (sc.created_at at time zone tz) as lt from public.scans sc
  ),
  per_loc as (
    select l.id, l.slug, l.name, l.sort_order, l.published, l.stamp_enabled,
      (select count(*) from s where s.location_id = l.id and s.lt::date = today)                        as today,
      (select count(*) from s where s.location_id = l.id and s.lt::date = today - 1)                    as yesterday,
      (select count(*) from s where s.location_id = l.id and s.lt::date > today - 7)                    as d7,
      (select count(*) from s where s.location_id = l.id and s.lt::date > today - 30)                   as d30,
      (select count(*) from s where s.location_id = l.id)                                               as total,
      (select count(distinct device_hash) from s where s.location_id = l.id and s.lt::date > today - 30) as uniq30,
      (select count(distinct device_hash) from s where s.location_id = l.id)                            as uniq_all,
      (select count(*) from public.stamps st where st.location_id = l.id)                               as stamps,
      (select count(*) from public.stamps st where st.location_id = l.id and st.gps_verified)           as stamps_gps,
      (select count(*) from s where s.location_id = l.id and s.stamp_result in ('invalid_code','rate_limited')) as rejected,
      (select count(*) from s where s.location_id = l.id and s.stamp_result in ('invalid_code','rate_limited') and s.lt::date > today - 30) as rejected30,
      (select count(*) from s where s.location_id = l.id and s.code_status = 'none' and s.lt::date > today - 30) as no_code30,
      (select coalesce(jsonb_agg(coalesce(c.n, 0) order by g.d), '[]'::jsonb)
         from generate_series(d0, today, interval '1 day') g(d)
         left join (select s.lt::date dd, count(*) n from s where s.location_id = l.id and s.lt::date >= d0 group by 1) c on c.dd = g.d::date) as daily,
      (select coalesce(jsonb_agg(coalesce(c.n, 0) order by h), '[]'::jsonb)
         from generate_series(0, 23) h
         left join (select extract(hour from s.lt)::int hh, count(*) n from s where s.location_id = l.id and s.lt::date > today - 30 group by 1) c on c.hh = h) as hourly
    from public.locations l
  ),
  tot as (
    select
      (select count(*) from s where s.lt::date = today)                        as today,
      (select count(*) from s where s.lt::date = today - 1)                    as yesterday,
      (select count(*) from s where s.lt::date > today - 7)                    as d7,
      (select count(*) from s where s.lt::date > today - 30)                   as d30,
      (select count(*) from s)                                                 as total,
      (select count(distinct device_hash) from s where s.lt::date = today)     as uniq_today,
      (select count(distinct device_hash) from s where s.lt::date > today - 7) as uniq7,
      (select count(distinct device_hash) from s where s.lt::date > today - 30) as uniq30,
      (select count(distinct device_hash) from s)                              as uniq_all,
      (select count(*) from public.stamps)                                     as stamps,
      (select count(*) from public.stamps where gps_verified)                  as stamps_gps,
      (select count(*) from public.stamps where (created_at at time zone tz)::date = today) as stamps_today,
      (select count(*) from s where s.stamp_result in ('invalid_code','rate_limited')) as rejected,
      (select count(*) from s where s.stamp_result in ('invalid_code','rate_limited') and s.lt::date > today - 30) as rejected30,
      (select count(*) from s where s.stamp_result in ('invalid_code','rate_limited') and s.lt::date = today) as rejected_today,
      (select count(*) from public.reward_claims)                              as claims,
      (select count(*) from public.reward_claims where redeemed_at is not null) as redeemed,
      (select coalesce(jsonb_agg(coalesce(c.n, 0) order by g.d), '[]'::jsonb)
         from generate_series(d0, today, interval '1 day') g(d)
         left join (select s.lt::date dd, count(*) n from s where s.lt::date >= d0 group by 1) c on c.dd = g.d::date) as daily,
      (select coalesce(jsonb_agg(coalesce(c.n, 0) order by g.d), '[]'::jsonb)
         from generate_series(d0, today, interval '1 day') g(d)
         left join (select s.lt::date dd, count(distinct device_hash) n from s where s.lt::date >= d0 group by 1) c on c.dd = g.d::date) as daily_unique,
      (select coalesce(jsonb_agg(coalesce(c.n, 0) order by h), '[]'::jsonb)
         from generate_series(0, 23) h
         left join (select extract(hour from s.lt)::int hh, count(*) n from s where s.lt::date > today - 30 group by 1) c on c.hh = h) as hourly
  )
  select jsonb_build_object(
    'generatedAt', now(),
    'today', today,
    'days', (select jsonb_agg(to_char(g.d, 'YYYY-MM-DD') order by g.d) from generate_series(d0, today, interval '1 day') g(d)),
    'stampsEnabled', (select stamps_enabled from public.settings where id = 1),
    'total', (select to_jsonb(tot) from tot),
    'locations', (select coalesce(jsonb_agg(to_jsonb(per_loc) order by sort_order, slug), '[]'::jsonb) from per_loc)
  ) into res;
  return res;
end;
$$;

-- Prava izvršavanja
revoke execute on function public.record_scan(text, text, text, text, double precision, double precision) from public, anon, authenticated;
revoke execute on function public.get_passport(text) from public, anon, authenticated;
revoke execute on function public.issue_rewards(text) from public, anon, authenticated;
revoke execute on function public.gen_claim_code() from public, anon, authenticated;
grant  execute on function public.record_scan(text, text, text, text, double precision, double precision) to service_role;
grant  execute on function public.get_passport(text) to service_role;

revoke execute on function public.lookup_claim(text) from public, anon;
revoke execute on function public.redeem_claim(text) from public, anon;
revoke execute on function public.admin_stats(int) from public, anon;
grant  execute on function public.lookup_claim(text) to authenticated;
grant  execute on function public.redeem_claim(text) to authenticated;
grant  execute on function public.admin_stats(int) to authenticated;
