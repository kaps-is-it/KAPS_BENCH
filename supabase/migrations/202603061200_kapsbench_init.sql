create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  username text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.device_profiles (
  id uuid primary key default gen_random_uuid(),
  gpu_renderer text not null,
  gpu_vendor text not null,
  gpu_architecture text,
  gpu_description text,
  webgpu_supported boolean not null default false,
  webgpu_info jsonb,
  cpu_logical_cores integer not null,
  device_memory_gb numeric,
  screen_width integer not null,
  screen_height integer not null,
  physical_width integer not null,
  physical_height integer not null,
  device_pixel_ratio numeric not null,
  color_depth integer not null,
  browser_name text not null,
  browser_version text not null,
  os_name text not null,
  os_version text not null,
  user_agent text not null,
  capabilities jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.benchmark_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  device_profile_id uuid not null references public.device_profiles(id) on delete cascade,
  coding_score integer not null,
  rating text not null,
  sub_scores jsonb not null default '{}'::jsonb,
  raw_metrics jsonb not null default '{}'::jsonb,
  benchmark_version text not null,
  browser_name text not null,
  browser_version text not null,
  os_platform text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_benchmark_results_created_at
  on public.benchmark_results(created_at desc);

alter table public.profiles enable row level security;
alter table public.device_profiles enable row level security;
alter table public.benchmark_results enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'profiles_select_self'
  ) then
    create policy profiles_select_self
      on public.profiles
      for select
      to authenticated
      using ((select auth.uid()) = id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'profiles_update_self'
  ) then
    create policy profiles_update_self
      on public.profiles
      for update
      to authenticated
      using ((select auth.uid()) = id)
      with check ((select auth.uid()) = id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'benchmark_results'
      and policyname = 'benchmark_results_select_self'
  ) then
    create policy benchmark_results_select_self
      on public.benchmark_results
      for select
      to authenticated
      using ((select auth.uid()) = user_id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'device_profiles'
      and policyname = 'device_profiles_read_none'
  ) then
    create policy device_profiles_read_none
      on public.device_profiles
      for select
      to authenticated
      using (false);
  end if;
end
$$;
