-- One row per email we send (free-rating result, sequences, "your analysis is ready"), with opens and clicks.
-- Opens come from a 1px image and clicks from tracked resalta.co links, both served by the 'correo' function.
create table if not exists public.correos_log (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  tipo text not null,            -- resultado | secuencia | listo
  secuencia text,
  paso int,
  asunto text,
  ok boolean,
  enviado_at timestamptz not null default now(),
  abierto_at timestamptz,
  aperturas int not null default 0,
  clic_at timestamptz,
  clics int not null default 0
);
create index if not exists correos_log_email on public.correos_log (email);
create index if not exists correos_log_fecha on public.correos_log (enviado_at desc);
alter table public.correos_log enable row level security;

create or replace function public.correo_evento(i uuid, t text) returns void language sql security definer set search_path = public as $f$
  update public.correos_log set
    aperturas = aperturas + 1,
    abierto_at = coalesce(abierto_at, now()),
    clics = clics + case when t = 'clic' then 1 else 0 end,
    clic_at = case when t = 'clic' then coalesce(clic_at, now()) else clic_at end
  where id = i;
$f$;
revoke all on function public.correo_evento(uuid, text) from public, anon, authenticated;
select 'ok' as listo, count(*) from public.correos_log;
