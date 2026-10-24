-- Statistika v2: razdvaja QR skeniranja (s kodom) od otvaranja stranice bez koda,
-- ne broji ponovna otvaranja iste lokacije s istog uređaja u roku od 30 min ni admin/test preglede.
-- Aditivno, bez DROP naredbi; postojeći podaci se ne mijenjaju.

create or replace function public.record_scan(p_slug text, p_code text, p_device_id text,
                                              p_gps_status text, p_lat double precision, p_lng double precision,
                                              p_count boolean)
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
  v_skip    boolean;
  p_device  text := public.device_hash(p_device_id);
begin
  if p_device is null then
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

  -- Statistika: ne broji admin/test preglede (p_count = false) ni ponovna otvaranja iste lokacije
  -- s istog uređaja u roku od 30 minuta (osvježavanje stranice, povratak nazad). Pogrešni kodovi se uvijek bilježe.
  v_skip := not coalesce(p_count, true)
            or (v_code <> 'invalid' and exists (
                  select 1 from public.scans
                   where device_hash = p_device and location_id = loc.id and code_status = v_code
                     and created_at > now() - interval '30 minutes'));
  if not v_skip then
    insert into public.scans (location_id, device_hash, code_status, gps_status, gps_distance_m, stamp_result)
    values (loc.id, p_device, v_code, v_gps, v_dist, v_result);
  end if;

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

-- stari potpis (6 argumenata) ostaje radi kompatibilnosti i uvijek broji
create or replace function public.record_scan(p_slug text, p_code text, p_device_id text,
                                              p_gps_status text, p_lat double precision, p_lng double precision)
returns jsonb
language sql
volatile
security definer
set search_path = public
as $$
  select public.record_scan(p_slug, p_code, p_device_id, p_gps_status, p_lat, p_lng, true);
$$;

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
      (select count(*) from s where s.location_id = l.id and s.code_status <> 'none' and s.lt::date = today)     as qr_today,
      (select count(*) from s where s.location_id = l.id and s.code_status <> 'none' and s.lt::date = today - 1) as qr_yesterday,
      (select count(*) from s where s.location_id = l.id and s.code_status <> 'none' and s.lt::date > today - 7) as qr_d7,
      (select count(*) from s where s.location_id = l.id and s.code_status <> 'none' and s.lt::date > today - 30) as qr_d30,
      (select count(*) from s where s.location_id = l.id and s.code_status <> 'none')                            as qr_total,
      (select coalesce(jsonb_agg(coalesce(c.n, 0) order by g.d), '[]'::jsonb)
         from generate_series(d0, today, interval '1 day') g(d)
         left join (select s.lt::date dd, count(*) n from s where s.location_id = l.id and s.code_status <> 'none' and s.lt::date >= d0 group by 1) c on c.dd = g.d::date) as qr_daily,
      (select coalesce(jsonb_agg(coalesce(c.n, 0) order by h), '[]'::jsonb)
         from generate_series(0, 23) h
         left join (select extract(hour from s.lt)::int hh, count(*) n from s where s.location_id = l.id and s.code_status <> 'none' and s.lt::date > today - 30 group by 1) c on c.hh = h) as qr_hourly,
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
      (select count(*) from s where s.code_status <> 'none' and s.lt::date = today)     as qr_today,
      (select count(*) from s where s.code_status <> 'none' and s.lt::date = today - 1) as qr_yesterday,
      (select count(*) from s where s.code_status <> 'none' and s.lt::date > today - 7) as qr_d7,
      (select count(*) from s where s.code_status <> 'none' and s.lt::date > today - 30) as qr_d30,
      (select count(*) from s where s.code_status <> 'none')                            as qr_total,
      (select coalesce(jsonb_agg(coalesce(c.n, 0) order by g.d), '[]'::jsonb)
         from generate_series(d0, today, interval '1 day') g(d)
         left join (select s.lt::date dd, count(*) n from s where s.code_status <> 'none' and s.lt::date >= d0 group by 1) c on c.dd = g.d::date) as qr_daily,
      (select coalesce(jsonb_agg(coalesce(c.n, 0) order by h), '[]'::jsonb)
         from generate_series(0, 23) h
         left join (select extract(hour from s.lt)::int hh, count(*) n from s where s.code_status <> 'none' and s.lt::date > today - 30 group by 1) c on c.hh = h) as qr_hourly,
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

revoke execute on function public.record_scan(text, text, text, text, double precision, double precision, boolean) from public, anon, authenticated;
grant  execute on function public.record_scan(text, text, text, text, double precision, double precision, boolean) to service_role;
revoke execute on function public.record_scan(text, text, text, text, double precision, double precision) from public, anon, authenticated;
grant  execute on function public.record_scan(text, text, text, text, double precision, double precision) to service_role;
