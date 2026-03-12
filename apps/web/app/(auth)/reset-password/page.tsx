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
      <div className="w-full max-w-sm mx-auto">
        <p className="text-xs text-muted-foreground text-center">Verifying your reset link...</p>
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
      <div className="w-full max-w-sm mx-auto">
        <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-right-4 duration-300">
          <div className="flex flex-col gap-1">
            <p className="text-xs text-muted-foreground">All done!</p>
            <h1 className="text-lg font-semibold tracking-tight">
              Password Reset Successfully
            </h1>
          </div>

          <div className="rounded-md border bg-muted/50 px-4 py-3 text-center">
            <p className="text-[10px] text-muted-foreground">
              Your password has been updated. You can now sign in with your new password.
            </p>
          </div>

          <Button
            onClick={() => router.push("/login")}
            size="lg"
          >
            Go to sign in
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm mx-auto">
      <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-right-4 duration-300">
        <div className="flex flex-col gap-1">
          <p className="text-xs text-muted-foreground">Almost there!</p>
          <h1 className="text-lg font-semibold tracking-tight">
            Reset Your Password
          </h1>
        </div>

        {error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-[10px] text-destructive animate-in fade-in slide-in-from-top-1 duration-200">
            {error}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
          className="flex flex-col gap-3"
        >
          <div className="flex flex-col gap-1.5">
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
            />
          </div>

          <div className="flex flex-col gap-1.5">
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
            />
          </div>

          <Button
            type="submit"
            size="lg"
            disabled={isPending || !password || !confirmPassword}
          >
            {isPending ? "Updating..." : "Reset password"}
          </Button>
        </form>
      </div>
    </div>
  );
}
