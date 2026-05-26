"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { getSupabaseClient } from "@/lib/supabase/client";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function finishSignIn() {
      const supabase = getSupabaseClient();
      if (!supabase) {
        setError("Supabase is not configured.");
        return;
      }

      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const oauthError =
        params.get("error_description") ?? params.get("error");

      if (oauthError) {
        setError(oauthError);
        return;
      }

      if (!code) {
        setError("Missing authorization code. Try signing in again.");
        return;
      }

      const { error: exchangeError } =
        await supabase.auth.exchangeCodeForSession(code);

      if (exchangeError) {
        setError(exchangeError.message);
        return;
      }

      router.replace("/login");
    }

    void finishSignIn();
  }, [router]);

  if (error) {
    return (
      <main className="mx-auto max-w-md space-y-4 py-8">
        <h1 className="text-xl font-semibold tracking-tight">Sign-in failed</h1>
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        <Link href="/login" className="text-sm underline">
          Back to account
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md py-8 text-sm text-zinc-600 dark:text-zinc-300">
      Completing Google sign-in…
    </main>
  );
}
