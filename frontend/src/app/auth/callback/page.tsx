"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2Icon, ShieldAlertIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { completeHostedUiSignIn, consumeReturnPath, startHostedUiSignIn } from "@/lib/cognitoAuth";

function AuthCallbackLoadingScreen() {
  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-50 flex items-center justify-center p-8">
      <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-neutral-900/80 px-6 py-4 shadow-2xl backdrop-blur-xl">
        <Loader2Icon className="h-5 w-5 animate-spin text-indigo-400" />
        <span className="text-sm text-neutral-300">Completing Google sign-in…</span>
      </div>
    </main>
  );
}

function AuthCallbackPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const oauthError = searchParams.get("error");
  const oauthErrorDescription = searchParams.get("error_description");
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const callbackParameterError = oauthErrorDescription || oauthError || (!code || !state ? "Cognito did not return an authorization code." : null);
  const [asyncError, setAsyncError] = useState<string | null>(null);

  useEffect(() => {
    if (callbackParameterError || !code || !state) {
      return;
    }

    let isActive = true;

    const callbackPromise = completeHostedUiSignIn(code, state);

    callbackPromise
      .then(() => {
        if (!isActive) {
          return;
        }

        router.replace(consumeReturnPath());
      })
      .catch((callbackError: unknown) => {
        if (!isActive) {
          return;
        }

        setAsyncError(callbackError instanceof Error ? callbackError.message : "Failed to finish the Cognito sign-in flow.");
      });

    return () => {
      isActive = false;
    };
  }, [callbackParameterError, code, router, state]);

  const error = callbackParameterError || asyncError;

  if (!error) {
    return (
      <main className="min-h-screen bg-neutral-950 text-neutral-50 flex items-center justify-center p-8">
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-neutral-900/80 px-6 py-4 shadow-2xl backdrop-blur-xl">
          <Loader2Icon className="h-5 w-5 animate-spin text-indigo-400" />
          <span className="text-sm text-neutral-300">Completing Google sign-in…</span>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-50 flex items-center justify-center p-8">
      <div className="w-full max-w-lg rounded-[2rem] border border-rose-500/20 bg-neutral-900/85 p-8 shadow-[0_24px_120px_rgba(0,0,0,0.45)] backdrop-blur-xl">
        <div className="mb-5 flex items-center gap-3 text-rose-300">
          <ShieldAlertIcon className="h-6 w-6" />
          <h1 className="text-xl font-semibold text-white">Sign-in failed</h1>
        </div>
        <p className="text-sm leading-6 text-neutral-300">{error}</p>
        <Button
          className="mt-6 w-full rounded-xl bg-white text-neutral-950 hover:bg-neutral-100"
          onClick={() => {
            const retryPromise = startHostedUiSignIn("/");
            retryPromise.catch((retryError: unknown) => {
              setAsyncError(retryError instanceof Error ? retryError.message : "Failed to restart the Google sign-in flow.");
            });
          }}
        >
          Try Google sign-in again
        </Button>
      </div>
    </main>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<AuthCallbackLoadingScreen />}>
      <AuthCallbackPageContent />
    </Suspense>
  );
}