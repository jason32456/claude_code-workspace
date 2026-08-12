"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";

type Action = (
  prev: { error?: string } | undefined,
  formData: FormData,
) => Promise<{ error?: string }>;

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn w-full" disabled={pending}>
      {pending ? "Please wait…" : label}
    </button>
  );
}

export function AuthForm({
  mode,
  action,
}: {
  mode: "login" | "register";
  action: Action;
}) {
  const [state, formAction] = useFormState(action, {});
  const isRegister = mode === "register";

  return (
    <div className="mx-auto mt-20 w-full max-w-sm">
      <div className="card">
        <h1 className="mb-1 text-2xl font-bold">
          {isRegister ? "Create your account" : "Welcome back"}
        </h1>
        <p className="mb-6 text-sm text-slate-500">
          {isRegister
            ? "Start tracking your money in seconds."
            : "Log in to your finance dashboard."}
        </p>

        <form action={formAction} className="space-y-4">
          {isRegister && (
            <div>
              <label className="label" htmlFor="name">
                Name
              </label>
              <input id="name" name="name" className="input" placeholder="Alex Doe" required />
            </div>
          )}
          <div>
            <label className="label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              className="input"
              placeholder="you@example.com"
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              className="input"
              placeholder="••••••••"
              required
              minLength={isRegister ? 6 : undefined}
            />
          </div>

          {state?.error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
          )}

          <SubmitButton label={isRegister ? "Create account" : "Log in"} />
        </form>
      </div>

      <p className="mt-4 text-center text-sm text-slate-500">
        {isRegister ? (
          <>
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-indigo-600 hover:underline">
              Log in
            </Link>
          </>
        ) : (
          <>
            New here?{" "}
            <Link href="/register" className="font-medium text-indigo-600 hover:underline">
              Create an account
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
