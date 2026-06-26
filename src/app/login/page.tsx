"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { getSupabaseClient } from "@/lib/supabase/client";

function readAuthErrorFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  const urlError = new URLSearchParams(window.location.search).get("error");
  if (!urlError) return null;
  if (urlError === "missing_code") {
    return "Sign-in did not finish. Confirm Supabase redirect URLs include /auth/callback for this site.";
  }
  if (urlError === "supabase_config") return "Supabase is not configured on the server.";
  return decodeURIComponent(urlError);
}

export default function LoginPage() {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(readAuthErrorFromUrl);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    if (!supabase) return;

    if (window.location.search.includes("error=")) {
      window.history.replaceState({}, "", "/login");
    }

    void supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user?.email ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, [supabase]);

  async function onGoogleSignIn() {
    setError(null);
    setStatus(null);
    if (!supabase) {
      setError("Supabase is not configured.");
      return;
    }
    setGoogleLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      setGoogleLoading(false);
      setError(error.message);
    }
  }

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
          "Email limit reached. Use Google sign-in instead, or set up Resend SMTP (docs/auth-email-setup.md)."
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
        <h1 className="arcade-title text-2xl leading-[1.1]">Account</h1>
        <p className="mt-1 text-sm text-muted">
          Optional — save imported games and live sessions to your account. Import and scoring work without
          signing in.
        </p>
      </div>

      {userEmail ? (
        <div className="card p-4">
          <div className="text-sm">
            Signed in as <span className="font-medium">{userEmail}</span>
          </div>
          <div className="mt-4 flex gap-3">
            <Link
              href="/my/sessions"
              className="inline-flex h-10 items-center btn-primary px-4"
            >
              My games
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
        <div className="space-y-4">
          <div className="card p-4">
            <button
              type="button"
              onClick={() => void onGoogleSignIn()}
              disabled={googleLoading}
              className="btn-secondary h-12 w-full gap-2 disabled:opacity-50"
            >
              <GoogleIcon />
              {googleLoading ? "Redirecting…" : "Continue with Google"}
            </button>
            <p className="mt-2 text-xs text-subtle">
              Recommended — no email setup required.
            </p>
          </div>

          <details className="card p-4">
            <summary className="cursor-pointer text-sm font-medium">Email magic link (optional)</summary>
            <div className="mt-3">
              <p className="text-xs text-subtle">
                Needs Resend SMTP in Supabase — see <code className="rounded bg-club-surface px-1 text-club-ink ring-1 ring-inset ring-club-border">docs/auth-email-setup.md</code>.
              </p>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="mt-2 h-11 w-full rounded-xl border border-stone-200 bg-club-surface px-3 text-sm dark:border-stone-600 dark:text-stone-100"
              />
              <button
                onClick={() => void onSendLink()}
                className="mt-3 inline-flex h-11 items-center btn-primary px-4"
              >
                Send magic link
              </button>
              {status ? (
                <div className="mt-3 text-sm text-emerald-700 dark:text-emerald-300">{status}</div>
              ) : null}
            </div>
          </details>

          {error ? <div className="text-sm text-red-600 dark:text-red-400">{error}</div> : null}
        </div>
      )}
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}
