"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { getSupabaseClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user?.email ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, [supabase]);

  async function onSendLink() {
    setError(null);
    setStatus(null);
    if (!supabase) {
      setError("Supabase is not configured.");
      return;
    }
    const trimmed = email.trim();
    if (!trimmed) return;

    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: { emailRedirectTo: `${window.location.origin}/login` },
    });

    if (error) {
      const msg = error.message.toLowerCase();
      if (msg.includes("rate limit") || msg.includes("email rate")) {
        setError(
          "Email limit reached. Supabase’s built-in mail allows ~2/hour — set up free Resend SMTP (see docs/auth-email-setup.md in the repo). You can still play without signing in."
        );
      } else {
        setError(error.message);
      }
      return;
    }
    setStatus("Check your email for the magic link (and spam folder).");
  }

  async function onSignOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setUserEmail(null);
  }

  return (
    <main className="mx-auto max-w-md space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
          Optional — claim games to your account. Scoring works without signing in.
        </p>
      </div>

      {userEmail ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="text-sm">
            Signed in as <span className="font-medium">{userEmail}</span>
          </div>
          <div className="mt-4 flex gap-3">
            <Link
              href="/my/sessions"
              className="inline-flex h-10 items-center rounded-xl bg-zinc-950 px-4 text-sm font-medium text-white dark:bg-white dark:text-zinc-950"
            >
              My sessions
            </Link>
            <button
              onClick={() => void onSignOut()}
              className="inline-flex h-10 items-center rounded-xl border border-zinc-200 px-4 text-sm dark:border-zinc-800"
            >
              Sign out
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <label className="text-sm font-medium">Email (magic link)</label>
          <p className="mt-1 text-xs text-zinc-500">
            Requires Resend SMTP in Supabase for reliable delivery — see{" "}
            <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">docs/auth-email-setup.md</code>.
          </p>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="mt-2 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
          />
          <button
            onClick={() => void onSendLink()}
            className="mt-3 inline-flex h-11 items-center rounded-xl bg-zinc-950 px-4 text-sm font-medium text-white dark:bg-white dark:text-zinc-950"
          >
            Send magic link
          </button>
          {status ? <div className="mt-3 text-sm text-emerald-700 dark:text-emerald-300">{status}</div> : null}
          {error ? <div className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</div> : null}
        </div>
      )}
    </main>
  );
}
