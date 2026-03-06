import { AuthPanel } from "@/components/auth/auth-panel";

export default function AuthPage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 pb-24 pt-8 sm:px-8 lg:px-12">
      <section className="surface-panel p-8">
        <p className="eyebrow">Optional identity layer</p>
        <h1 className="mt-4 text-5xl font-semibold tracking-[-0.06em] text-slate-950">
          Connect Supabase Auth when you want benchmark ownership tied to your account.
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-8 text-slate-600">
          Anonymous CPU and GPU runs still work. Signing in only changes how
          saved benchmark results are attributed and persisted.
        </p>
      </section>
      <AuthPanel />
    </div>
  );
}
