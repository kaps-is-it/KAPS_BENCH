# Can I Run This

Can I Run This is a desktop-first browser benchmark built with Next.js, Supabase, Web Workers, WebAssembly, and WebGPU. The public surface is intentionally simple:

- `/` shows two direct launch cards for the long-form CPU and GPU benchmarks
- `/benchmark/cpu` runs the CPU suite with single-core, multi-core, and sustained scoring
- `/benchmark/gpu` runs the GPU suite with graphics, compute, and sustained scoring
- `/results/[id]` renders saved, shareable benchmark results

## Local development

Install dependencies, generate the local benchmark assets, and start the dev server:

```bash
npm install
npm run bench:assets
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment

For Supabase-backed persistence, set these values in `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Then apply the SQL migrations in `supabase/migrations`.

For local-only development without Supabase persistence, enable the dev result store:

```env
KAPSBENCH_USE_DEV_STORE=1
```

## Verification

```bash
npm run lint
npm run test
npm run build
npm run test:e2e
```
