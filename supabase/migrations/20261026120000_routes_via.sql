-- Pješačke rute sa međutačkama: admin u uređivaču putanje zadaje tačke kroz koje ruta mora proći.
alter table public.routes add column if not exists via jsonb;
comment on column public.routes.via is 'Međutačke [[lat,lng],…] kroz koje pješačka ruta mora proći (postavlja admin u uređivaču putanje)';
