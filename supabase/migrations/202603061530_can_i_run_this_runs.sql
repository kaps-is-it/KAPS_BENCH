create table if not exists public.benchmark_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  device_profile_id uuid not null references public.device_profiles(id) on delete cascade,
  benchmark_kind text not null check (benchmark_kind in ('cpu', 'gpu')),
  headline_score integer not null,
  rating text not null,
  sub_scores jsonb not null default '{}'::jsonb,
  raw_metrics jsonb not null default '{}'::jsonb,
  benchmark_version text not null,
  browser_name text not null,
  browser_version text not null,
  os_platform text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_benchmark_runs_created_at
  on public.benchmark_runs(created_at desc);

alter table public.benchmark_runs enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'benchmark_runs'
      and policyname = 'benchmark_runs_select_self'
  ) then
    create policy benchmark_runs_select_self
      on public.benchmark_runs
      for select
      to authenticated
      using ((select auth.uid()) = user_id);
  end if;
end
$$;
