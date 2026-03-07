create index if not exists idx_benchmark_runs_kind_score_created
  on public.benchmark_runs(benchmark_kind, headline_score desc, created_at desc);

create index if not exists idx_benchmark_runs_raw_metrics_gin
  on public.benchmark_runs
  using gin (raw_metrics jsonb_path_ops);
