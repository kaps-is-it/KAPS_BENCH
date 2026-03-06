"use client";

import { useState, useTransition } from "react";
import { Github, Mail, ShieldCheck } from "lucide-react";
import { useAuthSession } from "@/components/providers/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getPublicSupabaseEnv } from "@/lib/env";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";

export function AuthPanel() {
  const { authEnabled, loading, user, signOut } = useAuthSession();
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const env = getPublicSupabaseEnv();
  const supabase = getBrowserSupabaseClient();

  const redirectTo = `${env.siteUrl}/auth`;

  const handleOAuth = (provider: "google" | "github") => {
    if (!supabase) {
      return;
    }

    startTransition(async () => {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo,
        },
      });

      setNotice(error ? error.message : null);
    });
  };

  const handleMagicLink = () => {
    if (!supabase || !email) {
      return;
    }

    startTransition(async () => {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: redirectTo,
        },
      });

      if (error) {
        setNotice(error.message);
        return;
      }

      setNotice("Magic link sent. Check your inbox to complete sign-in.");
    });
  };

  if (!authEnabled) {
    return (
      <Card className="surface-panel border-[rgb(var(--glow-amber))/0.22] bg-[rgb(var(--glow-amber))/0.12]">
        <CardHeader>
          <CardTitle>Supabase auth is not configured yet.</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm leading-7 text-slate-700">
          <p>
            Add the values from <code>.env.example</code> and restart the dev
            server. The benchmark can still run in local dev mode, but OAuth
            and magic-link auth stay disabled until the public keys are set.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card className="surface-panel">
        <CardContent className="flex min-h-40 items-center justify-center text-sm text-slate-600">
          Loading current session…
        </CardContent>
      </Card>
    );
  }

  if (user) {
    return (
      <Card className="surface-panel">
        <CardHeader className="space-y-4">
          <Badge className="w-fit rounded-full border-accent/25 bg-accent/10 text-accent">
            Connected
          </Badge>
          <CardTitle className="text-3xl tracking-[-0.04em]">
            {user.email ?? "Signed-in session"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 text-sm leading-7 text-slate-600">
          <p>
            Results submitted from this browser will attach your Supabase user
            automatically. Anonymous runs still work, but connected sessions
            keep ownership explicit.
          </p>
          <Button
            variant="outline"
            className="rounded-full border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            onClick={() => void signOut()}
          >
            Sign out
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="surface-panel">
      <CardHeader className="space-y-4">
        <Badge className="w-fit rounded-full border-primary/25 bg-primary/12 text-primary">
          Optional auth
        </Badge>
        <CardTitle className="text-3xl tracking-[-0.04em]">
          Connect a user before saving benchmark runs.
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-2">
          <Button
            className="h-12 rounded-full bg-primary text-primary-foreground"
            disabled={isPending}
            onClick={() => handleOAuth("google")}
          >
            <ShieldCheck className="size-4" />
            Continue with Google
          </Button>
          <Button
            variant="outline"
            className="h-12 rounded-full border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            disabled={isPending}
            onClick={() => handleOAuth("github")}
          >
            <Github className="size-4" />
            Continue with GitHub
          </Button>
        </div>

        <div className="soft-tile p-5">
          <p className="mb-3 text-sm uppercase tracking-[0.28em] text-slate-500">
            Magic link
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              type="email"
              placeholder="name@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="h-12 rounded-full border-slate-200 bg-white text-slate-900 placeholder:text-slate-400"
            />
            <Button
              variant="outline"
              className="h-12 rounded-full border-slate-200 bg-white px-5 text-slate-700 hover:bg-slate-50"
              disabled={isPending || !email}
              onClick={handleMagicLink}
            >
              <Mail className="size-4" />
              Send link
            </Button>
          </div>
        </div>

        {notice ? (
          <p className="text-sm leading-7 text-slate-600">{notice}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
