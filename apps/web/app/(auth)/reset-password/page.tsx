"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { updatePassword } from "../login/actions";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [sessionChecked, setSessionChecked] = useState(false);

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.replace("/login?error=reset_link_expired");
      } else {
        setSessionChecked(true);
      }
    });
  }, [router]);

  if (!sessionChecked) {
    return (
      <div className="w-full max-w-md mx-auto">
        <p className="text-muted-foreground text-center">Verifying your reset link...</p>
      </div>
    );
  }

  function handleSubmit() {
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    startTransition(async () => {
      setError(null);
      const result = await updatePassword(password);
      if (result?.error) {
        setError(result.error);
      } else {
        setSuccess(true);
      }
    });
  }

  if (success) {
    return (
      <div className="w-full max-w-md mx-auto">
        <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-right-4 duration-300">
          <div className="flex flex-col gap-2">
            <p className="text-muted-foreground">All done!</p>
            <h1 className="text-3xl font-bold tracking-tight">
              Password <span className="text-primary">Reset Successfully</span>
            </h1>
          </div>

          <div className="rounded-xl border bg-muted/50 px-6 py-5 text-center">
            <p className="text-sm text-muted-foreground">
              Your password has been updated. You can now sign in with your new
              password.
            </p>
          </div>

          <Button
            onClick={() => router.push("/login")}
            className="h-12 text-base font-semibold"
          >
            Go to sign in
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-right-4 duration-300">
        <div className="flex flex-col gap-2">
          <p className="text-muted-foreground">Almost there!</p>
          <h1 className="text-3xl font-bold tracking-tight">
            <span className="text-primary">Reset</span> Your Password
          </h1>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive animate-in fade-in slide-in-from-top-1 duration-200">
            {error}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              type="password"
              placeholder="At least 6 characters"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(null);
              }}
              disabled={isPending}
              autoFocus
              className="h-12 text-base"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="confirm-password">Confirm password</Label>
            <Input
              id="confirm-password"
              type="password"
              placeholder="Re-enter your password"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                setError(null);
              }}
              disabled={isPending}
              className="h-12 text-base"
            />
          </div>

          <Button
            type="submit"
            disabled={isPending || !password || !confirmPassword}
            className="h-12 text-base font-semibold"
          >
            {isPending ? "Updating..." : "Reset password"}
          </Button>
        </form>
      </div>
    </div>
  );
}
