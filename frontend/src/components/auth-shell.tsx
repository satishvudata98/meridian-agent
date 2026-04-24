"use client";

import type { ReactNode } from "react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { Loader2Icon, LogInIcon, LogOutIcon, ShieldCheckIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  ensureFreshAuthSession,
  getAuthSession,
  getMissingAuthConfigKeys,
  signOutFromHostedUi,
  startHostedUiSignIn,
  subscribeToAuthSession,
} from "@/lib/cognitoAuth";

function LoadingScreen() {
  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-50 flex items-center justify-center p-8">
      <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-neutral-900/70 px-5 py-3.5 shadow-2xl backdrop-blur-xl">
        <Loader2Icon className="h-5 w-5 animate-spin text-indigo-400" />
        <span className="text-sm text-neutral-300">Opening Meridian…</span>
      </div>
    </main>
  );
}

function MissingConfigScreen({ missingKeys }: Readonly<{ missingKeys: string[] }>) {
  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-50 px-6 py-16">
      <div className="mx-auto max-w-2xl rounded-[2rem] border border-rose-500/20 bg-neutral-900/80 p-8 shadow-[0_30px_120px_rgba(0,0,0,0.45)] backdrop-blur-xl">
        <div className="mb-6 flex items-center gap-3 text-rose-300">
          <ShieldCheckIcon className="h-6 w-6" />
          <h1 className="text-2xl font-semibold text-white">Authentication is not configured</h1>
        </div>
        <p className="mb-4 text-sm leading-6 text-neutral-300">
          The frontend auth shell is enabled, but the Cognito environment variables are missing. Configure the values below before using the production auth flow.
        </p>
        <div className="rounded-2xl border border-white/10 bg-black/30 p-4 font-mono text-sm text-amber-200">
          {missingKeys.join("\n")}
        </div>
      </div>
    </main>
  );
}

function SignedOutScreen({ onSignIn, error }: Readonly<{ onSignIn: () => void; error: string | null }>) {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.15),transparent_38%),linear-gradient(180deg,#09090b_0%,#0f172a_100%)] px-5 py-10 text-neutral-50 sm:px-6 sm:py-14">
      <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <section className="space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-400/20 bg-indigo-500/10 px-3 py-1.5 text-xs text-indigo-200">
            <ShieldCheckIcon className="h-4 w-4" /> Sign in required
          </div>
          <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Sign in to continue
          </h1>
          <p className="max-w-xl text-sm leading-6 text-neutral-300 sm:text-base">
            Use Google to access your runs and reports.
          </p>
        </section>

        <section className="rounded-[1.6rem] border border-white/10 bg-neutral-900/75 p-5 shadow-[0_24px_120px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:p-6">
          <h2 className="text-lg font-semibold text-white">Google sign-in</h2>
          <p className="mt-2 text-sm leading-6 text-neutral-300">
            One click and you are in.
          </p>
          {error && (
            <div className="mt-4 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {error}
            </div>
          )}
          <Button onClick={onSignIn} className="mt-5 h-11 w-full rounded-xl bg-white text-neutral-950 hover:bg-neutral-100">
            <LogInIcon className="mr-2 h-4 w-4" /> Continue with Google
          </Button>
        </section>
      </div>
    </main>
  );
}

export default function AuthShell({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname();
  const session = useSyncExternalStore(subscribeToAuthSession, getAuthSession, () => null);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    const refreshPromise = ensureFreshAuthSession();

    refreshPromise
      .catch((error: unknown) => {
        if (!isActive) {
          return;
        }

        setAuthError(error instanceof Error ? error.message : "Failed to initialize the Cognito session.");
      })
      .finally(() => {
        if (isActive) {
          setIsLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, []);

  if (pathname.startsWith("/auth/callback")) {
    return <>{children}</>;
  }

  if (isLoading) {
    return <LoadingScreen />;
  }

  const missingKeys = getMissingAuthConfigKeys();
  if (missingKeys.length > 0) {
    return <MissingConfigScreen missingKeys={missingKeys} />;
  }

  if (!session) {
    return (
      <SignedOutScreen
        error={authError}
        onSignIn={() => {
          setAuthError(null);
          const signInPromise = startHostedUiSignIn(pathname || "/");

          signInPromise.catch((error: unknown) => {
            setAuthError(error instanceof Error ? error.message : "Failed to start the Google sign-in flow.");
          });
        }}
      />
    );
  }

  const userLabel = session.user.name?.trim() || session.user.email?.trim() || "Account";

  return (
    <div className="min-h-full bg-neutral-950 text-neutral-50">
      <div className="sticky top-0 z-50 border-b border-white/10 bg-neutral-950/80 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-6xl flex-row items-center justify-between gap-3 px-4 py-2.5 sm:px-5 lg:px-8">
          <div className="min-w-0 flex items-center gap-2.5">
            <div className="flex h-9 w-9 flex-none items-center justify-center rounded-xl border border-sky-400/20 bg-sky-500/10 text-sky-200 shadow-[0_0_18px_rgba(56,189,248,0.14)]">
              <ShieldCheckIcon className="h-4.5 w-4.5" />
            </div>
            <div className="max-w-[min(52vw,14rem)] truncate text-sm font-medium text-white sm:max-w-[18rem]">
              {userLabel}
            </div>
          </div>
          <Button
            variant="outline"
            className="h-9 rounded-xl border-white/10 bg-white/5 px-3.5 text-neutral-100 hover:bg-white/10"
            onClick={signOutFromHostedUi}
          >
            <LogOutIcon className="mr-2 h-4 w-4" /> Sign out
          </Button>
        </div>
      </div>
      {children}
    </div>
  );
}